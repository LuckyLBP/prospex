// Hittar nya kunder till Digital Kontakt och lägger dem i deras lista (leverantören med slug digital-kontakt).
//
// Byrån sätter ingen signatur i sidfoten, så den vanliga metoden fungerar inte. Det som fungerar:
//
//   1. Byråns nyare sajter laddar ett eget tillägg per kund: wp-content/plugins/dk-<kund>-v2/ (site.js, phone-validation.js).
//   2. Alla sajter med tillägget ligger på samma server som digitalkontakt.se (SiteGround, 35.214.237.6 när detta skrevs).
//   3. Några äldre Divi-bygge läcker byråns testadress digitalkontakt<bokstav><nr>.sg-host.com eller länkar digitalkontakt.pipedrive.com.
//
// Därför: slå upp serverns IP, ta alla sajter på den (ViewDNS omvänd IP, annars HackerTarget) och hämta varje startsida.
//   ny     visar något av spåren ovan (säker)
//   trolig inget spår, men samma byggprofil som de kända kunderna: Divi-temat och antingen svensk sida eller Site Kit
// En delad server räcker ALDRIG ensam. Spåren fångar bara de nyare bygget: 195 av de 219 första kunderna låg på servern men
// bara 53 av dem visade ett spår (27 %). Därför finns profilen, där kända kunder utan tillägg hade Divi 92 %, Site Kit 64 %,
// svenskt språk 83 % och övriga sajter på servern 90 %, 91 % och 88 %. Profilen är en bedömning, inte ett bevis, och
// avvikare finns (dumontperfumes.se var en). Använd --only-traced vid apply för att bara ta de säkra.
//
// SearchWebCode går inte att använda här: motorn indexerar inte filnamn med bindestreck (phone-validation.js gav 0 träffar,
// ordet ensamt gav 802 orelaterade sajter från hela världen). Slösa inga krediter på det.
//
//   node --env-file=.env.local scripts/refresh-digital-kontakt.mts scan             skriver scripts/out/digital-kontakt-scan.tsv
//   node --env-file=.env.local scripts/refresh-digital-kontakt.mts apply [--dry-run] [--only-traced]   lägger nya domäner i listan
//
// Upptäckten är en sökning, inte en bekräftelse av när kunden tillkom: månaden i uploads/ i sidans kod är INTE ett
// startdatum (48 av 50 kända sajter visar samma månad), så "nya" betyder bara nya för listan.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve4 } from "node:dns/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const SLUG = "digital-kontakt";
const AGENCY_DOMAIN = "digitalkontakt.se";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "digital-kontakt-scan.tsv");
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000;
const CONCURRENCY = 30;

const PLUGIN = /wp-content\/plugins\/(dk-[A-Za-z0-9_-]+-v2)/;
const STAGING = /digitalkontakt[a-z]?[0-9]*\.sg-host\.com/i;
const PIPEDRIVE = /digitalkontakt\.pipedrive\.com/i;

type Trace = { plugin: string; staging: string; pipedrive: string };

/** Spåren på en sida. Ren, testbar. */
export function tracesIn(html: string): Trace | null {
  const plugin = PLUGIN.exec(html)?.[1] ?? "";
  const staging = STAGING.exec(html)?.[0] ?? "";
  const pipedrive = PIPEDRIVE.exec(html)?.[0] ?? "";
  return plugin || staging || pipedrive ? { plugin, staging, pipedrive } : null;
}

/** Byggprofilen hos kunder utan tillägg. Ren, testbar. Kräver en riktig sida, inte ett felsvar. */
export function profileIn(html: string): boolean {
  if (html.length < 1000) return false;
  const divi = html.includes("themes/Divi");
  const swedish = /<html[^>]*lang="sv/i.test(html);
  const siteKit = html.includes("Site Kit by Google");
  return divi && (swedish || siteKit);
}

async function reverseIp(ip: string): Promise<string[]> {
  const key = process.env.VIEWDNS_API_KEY;
  if (key) {
    const res = await fetch(`https://api.viewdns.info/reverseip/?host=${ip}&apikey=${key}&output=json`, { signal: AbortSignal.timeout(90_000) });
    const body = (await res.json().catch(() => ({}))) as { response?: { domains?: { name?: string }[] }; error?: unknown };
    const list = body.response?.domains?.map((d) => (d.name ?? "").toLowerCase()).filter(Boolean);
    if (list?.length) return [...new Set(list)];
    console.warn("ViewDNS gav ingen lista (kvoten slut?), försöker HackerTarget:", JSON.stringify(body.error ?? body).slice(0, 120));
  }
  // Gratis men begränsad till ca 500 domäner och ca 50 anrop per dag.
  const res = await fetch(`https://api.hackertarget.com/reverseiplookup/?q=${ip}`, { signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (/^error|API count exceeded/i.test(text)) throw new Error(`HackerTarget: ${text.slice(0, 100)}`);
  return [...new Set(text.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

async function fetchHtml(domain: string): Promise<string> {
  try {
    // Ingen egen user-agent: serverns botskydd stänger anslutningen för ProspexBot (UND_ERR_SOCKET) men släpper in Nodes standard.
    const res = await fetch(`https://${domain}`, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, MAX_BYTES).toString("utf8");
  } catch {
    return "";
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { for (let k = i++; k < items.length; k = i++) out[k] = await fn(items[k]); }));
  return out;
}

const db = () => {
  if (!process.env.PROSPEX_DATABASE_URL) throw new Error("PROSPEX_DATABASE_URL saknas (kör med --env-file=.env.local).");
  return new pg.Pool({ connectionString: process.env.PROSPEX_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
};

const splitDomains = (s: string): string[] => s.split(/\r?\n/).map((d) => d.trim().toLowerCase()).filter(Boolean);

async function scan(): Promise<void> {
  const pgPool = db();
  try {
    const { rows } = await pgPool.query(`select config->>'domains' as d from suppliers where slug = $1`, [SLUG]);
    if (!rows[0]) throw new Error(`Hittar ingen leverantör med slug ${SLUG}.`);
    const have = new Set(splitDomains(rows[0].d ?? ""));

    const [ip] = await resolve4(AGENCY_DOMAIN);
    console.log(`${AGENCY_DOMAIN} -> ${ip}`);
    const sites = (await reverseIp(ip)).filter((d) => d !== AGENCY_DOMAIN);
    console.log(`${sites.length} sajter på servern, hämtar startsidorna...`);

    const rows2 = await pool(sites, CONCURRENCY, async (d) => {
      const html = await fetchHtml(d);
      return { d, t: tracesIn(html), p: profileIn(html) };
    });
    const found = rows2.filter((r) => r.t || r.p);
    const status = (r: (typeof found)[number]) => (have.has(r.d) ? "i-listan" : r.t ? "ny" : "trolig");
    const count = (s: string) => found.filter((r) => status(r) === s).length;
    console.log(`${found.filter((r) => r.t).length} visar ett spår, ${found.filter((r) => !r.t).length} bara profilen.`);
    console.log(`Saknas i listan: ${count("ny")} med spår, ${count("trolig")} troliga.`);

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, "");
    for (const r of found) appendFileSync(OUT, `${r.d}\t${status(r)}\t${r.t?.plugin ?? ""}\t${r.t?.staging ?? ""}\t${r.t?.pipedrive ?? ""}\n`);
    console.log(`Skrev ${OUT}. Granska, kör sedan apply.`);
  } finally {
    await pgPool.end();
  }
}

async function apply(): Promise<void> {
  if (!existsSync(OUT)) throw new Error("Kör scan först.");
  const onlyTraced = process.argv.includes("--only-traced");
  const wanted = onlyTraced ? ["ny"] : ["ny", "trolig"];
  const fresh = readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")).filter((c) => wanted.includes(c[1])).map((c) => c[0]);
  const dry = process.argv.includes("--dry-run");
  const pgPool = db();
  try {
    const client = await pgPool.connect();
    try {
      await client.query("begin");
      // Läser om listan i samma transaktion, så att något som lagts till under tiden inte dubbleras.
      const { rows } = await client.query(`select id, config->>'domains' as d from suppliers where slug = $1 for update`, [SLUG]);
      if (!rows[0]) throw new Error(`Hittar ingen leverantör med slug ${SLUG}.`);
      const have = new Set(splitDomains(rows[0].d ?? ""));
      const add = [...new Set(fresh)].filter((d) => !have.has(d)).sort();
      console.log(`${add.length} nya domäner${dry ? " (dry-run, inget skrivs)" : ""}.`);
      if (add.length && !dry) {
        const next = [...splitDomains(rows[0].d ?? ""), ...add].join("\r\n");
        await client.query(`update suppliers set config = jsonb_set(config, '{domains}', to_jsonb($2::text)), updated_at = now() where id = $1`, [rows[0].id, next]);
      }
      await client.query(dry ? "rollback" : "commit");
      console.log(dry ? "Klart, ingenting ändrades." : "Klart. Starta en insamling för källan så blir domänerna till företag.");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pgPool.end();
  }
}

// Körs bara som skript, inte när testerna importerar tracesIn.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const cmd = process.argv[2];
  if (cmd === "scan") await scan();
  else if (cmd === "apply") await apply();
  else console.log("Användning: node --env-file=.env.local scripts/refresh-digital-kontakt.mts scan | apply [--dry-run]");
}
