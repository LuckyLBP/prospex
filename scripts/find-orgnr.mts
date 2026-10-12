// Letar efter org.nr på webbplatserna för företag som saknar ett. Ingen AI, bara sidorna själva.
//
// Berikningen läser redan startsidan och en kontaktsida. Det här skriptet går djupare: länkar från startsidan som
// låter som kontakt, om oss, villkor eller integritet, plus en handfull vanliga sökvägar. Det känner också igen
// momsregistreringsnummer (SE556677889901 är org.nr 556677-8899) och taxID/vatID i JSON-LD, som berikningen missar.
//
// Två steg, så att resultatet kan granskas innan något skrivs:
//
//   node scripts/find-orgnr.mts scan [--limit N] [--concurrency N]   skriver scripts/out/orgnr-scan.jsonl
//   node scripts/find-orgnr.mts apply [--dry-run]                    skriver fynden till companies.orgnr
//
// Scan går att avbryta och starta om: domäner som redan finns i filen hoppas över.
// Apply skriver bara där orgnr fortfarande saknas, och hoppar över nummer som hittats på fler än MAX_SHARED domäner
// (då är det nästan alltid byrån eller plattformen som står i sidfoten, inte företaget).
// Personnummer (enskild firma) tas aldrig: findOrgNumber och vatOrgnr kräver att tredje siffran är minst 2.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { findOrgNumber, isValidOrgNumber, ORG_GROUP } from "../lib/enrich/orgnr.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "orgnr-scan.jsonl");
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 512_000;
const MAX_PAGES = 6;
const MAX_SHARED = 2;
const USER_AGENT = "Mozilla/5.0 (compatible; ProspexBot/1.0; +https://prospex.se)";

const LINK_HINT = /kontakt|contact|om-?oss|about|villkor|terms|integritet|privacy|gdpr|personuppgift|cookie|impressum|foretag|företag/i;
const FALLBACK_PATHS = ["/kontakt", "/kontakta-oss", "/om-oss", "/contact", "/about", "/integritetspolicy", "/kopvillkor", "/allmanna-villkor"];

interface ScanRow {
  id: string;
  domain: string;
  orgnr: string | null;
  via: "vat" | "jsonld" | "text" | null;
  page: string | null;
  pages: number;
  error: string | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Hitta numret i en sida

const DASHES = /[‐-―−]/g;

function decode(s: string): string {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(ndash|mdash|minus|hyphen);/g, "-")
    .replace(/&amp;/g, "&")
    .replace(DASHES, "-")
    .replace(/ /g, " ");
}

function visibleText(html: string): string {
  return decode(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
}

/** Ett org.nr som ser ut att vara ett bolags och inte ett personnummer. */
function companyOrgnr(digits: string): string | null {
  if (!/^\d{10}$/.test(digits) || Number(digits[2]) < 2 || !ORG_GROUP.test(digits) || !isValidOrgNumber(digits)) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

/** Momsregistreringsnummer: SE + org.nr + 01. Med prefix och suffix är det otvetydigt. */
function vatOrgnr(text: string): string | null {
  for (const m of text.matchAll(/\bSE[\s-]?(\d{6})[\s-]?(\d{4})[\s-]?01\b/gi)) {
    const hit = companyOrgnr(m[1] + m[2]);
    if (hit) return hit;
  }
  return null;
}

function jsonLdOrgnr(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const v of m[1].matchAll(/"(?:taxID|vatID|leiCode|identifier)"\s*:\s*"([^"]{10,20})"/gi)) {
      const raw = decode(v[1]).replace(/[\s-]/g, "");
      const hit = vatOrgnr(v[1]) ?? companyOrgnr(raw.replace(/^SE/i, "").slice(0, 10));
      if (hit) return hit;
    }
  }
  return null;
}

export function orgnrInHtml(html: string): { orgnr: string; via: ScanRow["via"] } | null {
  const ld = jsonLdOrgnr(html);
  if (ld) return { orgnr: ld, via: "jsonld" };
  const text = visibleText(html);
  const vat = vatOrgnr(text);
  if (vat) return { orgnr: vat, via: "vat" };
  const plain = findOrgNumber(text);
  return plain ? { orgnr: plain, via: "text" } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Hämta sidor

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8" },
    });
    if (!res.ok || !res.body) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml/i.test(type)) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let html = "";
    let total = 0;
    try {
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return html.trim() ? { html, finalUrl: res.url || url } : null;
  } catch {
    return null;
  }
}

/** Sidor på samma webbplats som startsidan länkar till och som brukar ha org.nr, i ordning. */
function candidatePages(html: string, base: string): string[] {
  const origin = new URL(base);
  const sameSite = (h: string) => h.replace(/^www\./, "") === origin.hostname.replace(/^www\./, "");
  const found: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]+>/g, " ");
    if (!LINK_HINT.test(m[1]) && !LINK_HINT.test(label)) continue;
    try {
      const u = new URL(m[1], base);
      if (!/^https?:$/.test(u.protocol) || !sameSite(u.hostname) || /\.(pdf|jpe?g|png|zip)$/i.test(u.pathname)) continue;
      u.hash = "";
      found.push(u.toString());
    } catch {}
  }
  for (const p of FALLBACK_PATHS) found.push(new URL(p, base).toString());
  const home = new URL(base).toString();
  return [...new Set(found)].filter((u) => u !== home);
}

async function scanDomain(id: string, domain: string): Promise<ScanRow> {
  const row: ScanRow = { id, domain, orgnr: null, via: null, page: null, pages: 0, error: null };
  const home = (await fetchHtml(`https://${domain}/`)) ?? (await fetchHtml(`http://${domain}/`));
  row.pages = 1;
  if (!home) return { ...row, error: "no-response" };
  const hit = orgnrInHtml(home.html);
  if (hit) return { ...row, ...hit, page: home.finalUrl };
  for (const url of candidatePages(home.html, home.finalUrl).slice(0, MAX_PAGES - 1)) {
    const page = await fetchHtml(url);
    row.pages++;
    if (!page) continue;
    const found = orgnrInHtml(page.html);
    if (found) return { ...row, ...found, page: page.finalUrl };
  }
  return row;
}

// ---------------------------------------------------------------------------------------------------------------
// Kommandon

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : (process.argv[i + 1] ?? "");
}

function readRows(): ScanRow[] {
  if (!existsSync(OUT)) return [];
  return readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as ScanRow);
}

function db() {
  if (!process.env.PROSPEX_DATABASE_URL) throw new Error("PROSPEX_DATABASE_URL saknas (kör med --env-file=.env.local).");
  return new pg.Pool({ connectionString: process.env.PROSPEX_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
}

async function scan() {
  const limit = Number(arg("limit") ?? 0);
  const concurrency = Number(arg("concurrency") ?? 24);
  const done = new Set(readRows().map((r) => r.id));
  const pool = db();
  const { rows } = await pool.query<{ id: string; domain: string }>(
    `select id, domain from companies where orgnr is null and domain is not null order by first_seen_at desc`,
  );
  await pool.end();
  const todo = rows.filter((r) => !done.has(r.id)).slice(0, limit || undefined);
  console.log(`${rows.length} företag saknar org.nr, ${done.size} redan skannade, ${todo.length} att skanna nu.`);
  mkdirSync(dirname(OUT), { recursive: true });

  let next = 0, finished = 0, hits = 0;
  const started = Date.now();
  async function worker() {
    while (next < todo.length) {
      const { id, domain } = todo[next++];
      const row = await scanDomain(id, domain).catch((e) => ({ id, domain, orgnr: null, via: null, page: null, pages: 0, error: String(e) }) as ScanRow);
      appendFileSync(OUT, JSON.stringify(row) + "\n");
      finished++;
      if (row.orgnr) hits++;
      if (finished % 100 === 0 || finished === todo.length) {
        const rate = finished / ((Date.now() - started) / 1000);
        console.log(`${finished}/${todo.length}  träffar ${hits} (${((hits / finished) * 100).toFixed(1)} %)  ${rate.toFixed(1)}/s`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function apply() {
  const dry = process.argv.includes("--dry-run");
  const found = readRows().filter((r) => r.orgnr);
  const domainsPer = new Map<string, Set<string>>();
  for (const r of found) domainsPer.set(r.orgnr!, (domainsPer.get(r.orgnr!) ?? new Set()).add(r.domain));
  const shared = [...domainsPer].filter(([, d]) => d.size > MAX_SHARED);
  const keep = found.filter((r) => domainsPer.get(r.orgnr!)!.size <= MAX_SHARED);

  console.log(`${found.length} fynd, ${keep.length} att skriva, ${found.length - keep.length} hoppas över (nummer på fler än ${MAX_SHARED} domäner):`);
  for (const [orgnr, d] of shared.sort((a, b) => b[1].size - a[1].size)) console.log(`  ${orgnr}  ${d.size} domäner, t.ex. ${[...d].slice(0, 3).join(", ")}`);
  const byVia = keep.reduce<Record<string, number>>((acc, r) => ((acc[r.via!] = (acc[r.via!] ?? 0) + 1), acc), {});
  console.log("Källa:", byVia);
  if (dry) return;

  const pool = db();
  let written = 0;
  for (const r of keep) {
    const res = await pool.query(
      `update companies
          set orgnr = $2,
              registry_checked_at = null,
              enrichment = coalesce(enrichment, '{}'::jsonb) || jsonb_build_object('orgnrFound', jsonb_build_object('via', $3::text, 'page', $4::text, 'at', now()))
        where id = $1 and orgnr is null`,
      [r.id, r.orgnr, r.via, r.page],
    );
    written += res.rowCount ?? 0;
  }
  await pool.end();
  console.log(`Skrev org.nr på ${written} företag. Registerkollen hämtar Bolagsverkets uppgifter för dem vid nästa körning.`);
}

const cmd = process.argv[2];
if (cmd === "scan") await scan();
else if (cmd === "apply") await apply();
else console.log("Användning: node --env-file=.env.local scripts/find-orgnr.mts scan|apply [--limit N] [--concurrency N] [--dry-run]");
