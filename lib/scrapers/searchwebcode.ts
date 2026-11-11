import { CollectorError } from "./types";
import { normalizeDomain } from "./domain";

// SearchWebCode: "vilka sajter har den här strängen i sin källkod", ett alternativ till PublicWWW.
//
//   GET/POST https://www.searchwebcode.com/api/v1/search   Authorization: Bearer <nyckel>
//   q            sökningen: en citerad fras, eller booleska uttryck (AND, OR, NOT, -, parenteser)
//   regex        true = q är ett reguljärt uttryck
//   tld          begränsa till en toppdomän (se, com, ...)
//   limit        1 till 256 per sida; offset / next_offset för att bläddra
//   counts_only  true = bara antalet, utan kostnad
//
// En sökning (en "search credit", cirka 0,05 USD) täcker frågan och 25 sidanrop under ett glidande dygn, så att bläddra
// igenom några tusen träffar kostar inte mer än den första sidan. Indexet har en startsida per värdnamn.

const ENDPOINT = "https://www.searchwebcode.com/api/v1/search";
export const PAGE_SIZE = 256;
/** Så många sidor hämtas som mest per sökning, så att allt ryms i den ena krediten (frågan + 25 sidanrop). */
export const MAX_PAGES = 25;
/** Uppehåll mellan två anrop. API:et svarar 429 med Retry-After: 600 när det körs för tätt, och räknar också count-anrop. */
export const MIN_GAP_MS = 3000;

export interface SwcResponse {
  count_kind?: string;
  total?: number;
  candidate_total?: number;
  next_offset?: number | null;
  limit_applied?: number;
  charged_cents?: number;
  balance_cents?: number;
  results?: { domain?: string | null; url?: string | null }[];
  error?: string | { code?: string; message?: string };
  message?: string;
}

export interface SwcDeps {
  fetch: typeof globalThis.fetch;
  apiKey: string | undefined;
  /** Väntar mellan anrop. Utbytbar i tester, så att de inte väntar på riktigt. */
  sleep?: (ms: number) => Promise<void>;
}
export const defaultSwcDeps = (): SwcDeps => ({ fetch: globalThis.fetch, apiKey: process.env.SEARCHWEBCODE_API_KEY });

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let lastCall = 0;
export const isSwcConfigured = (d: SwcDeps = defaultSwcDeps()): boolean => !!d.apiKey;

export interface SwcQuery {
  q: string;
  regex?: boolean;
  tld?: string;
}

/** Ord som finns på nästan varje sajt och därför inte kan snäva in kandidaterna. */
const COMMON = new Set(["http", "https", "www", "com", "html", "href", "src", "content", "themes", "plugins", "wp-content", "wp-includes", "assets", "static", "script", "style", "image", "images", "files", "file", "link", "type", "text", "data", "class", "this", "that", "with", "from", "jquery", "google", "facebook"]);

/**
 * Det mest utmärkande ordet i en fras: det längsta ordet (bokstäver, siffror, - och _) som inte är vanligt, minst fyra
 * tecken. Null när frasen saknar ett sådant ord eller bara består av ett ord. Ren.
 */
export function anchorWord(phrase: string): string | null {
  if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(phrase)) return null; // ett ord: matchas redan som helt ord
  const words: string[] = [];
  for (const m of phrase.matchAll(/[A-Za-z0-9][A-Za-z0-9_-]*/g)) {
    // Ett ord som sitter ihop med streck eller understreck framför sig (--mht-header-bar-height) hör till ett längre ord
    // i källkoden, och som helt ord finns det inte där. Då används det inte.
    const before = phrase[(m.index ?? 0) - 1];
    if (before === "-" || before === "_") continue;
    words.push(m[0].replace(/[-_]+$/, ""));
  }
  const best = words.filter((w) => w.length >= 4 && !COMMON.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0];
  return best ?? null;
}

/**
 * En PublicWWW-fråga som SearchWebCode-fråga: `"x" site:se` blir frasen "x" med tld=se. En fras med citattecken inuti
 * (href="https://a.se") citeras som en helhet, med citattecknen skyddade.
 *
 * Frasen får dessutom sitt mest utmärkande ord framför sig (`swedags AND "swedags.se"`). Motorn väljer kandidater ur ett
 * index över hela ord, och en fras som "swedags.se" ger 189 534 kandidater (alla sajter med .se) för 27 riktiga träffar,
 * medan ordet ensamt ger 19. Ordet snäver in kandidaterna, och frasen avgör ändå vad som räknas som träff. Ren.
 */
export function fromPublicwww(query: string): SwcQuery {
  let q = query.trim();
  let tld: string | undefined;
  const site = /\s+site:([a-z]{2,10})\s*$/i.exec(q);
  if (site) {
    tld = site[1].toLowerCase();
    q = q.slice(0, site.index).trim();
  }
  const simple = q.length >= 2 && q.startsWith('"') && q.endsWith('"') && !q.slice(1, -1).includes('"');
  const inner = simple ? q.slice(1, -1) : q;
  const phrase = simple ? q : `"${q.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const anchor = anchorWord(inner);
  return { q: anchor ? `${anchor} AND ${phrase}` : phrase, ...(tld ? { tld } : {}) };
}

/** Träffarna ur ett svar: domänen (utan www) och sidan, en per domän. Ren. */
export function hitsFromResponse(body: SwcResponse): { domain: string; url: string | null }[] {
  const out = new Map<string, string | null>();
  for (const r of body.results ?? []) {
    const d = normalizeDomain(r.domain ?? r.url);
    if (d && !out.has(d)) out.set(d, r.url ?? null);
  }
  return [...out].map(([domain, url]) => ({ domain, url }));
}

/** Bara domänerna ur ett svar, utan dubbletter. Ren. */
export const domainsFromResponse = (body: SwcResponse): string[] => hitsFromResponse(body).map((h) => h.domain);

function errorText(body: SwcResponse): string {
  const e = body.error;
  return (typeof e === "string" ? e : e?.message ?? body.message ?? "okänt fel").slice(0, 160);
}

async function call(query: SwcQuery, extra: Record<string, string>, ctx: { signal: AbortSignal }, deps: SwcDeps): Promise<SwcResponse> {
  if (!deps.apiKey) throw new CollectorError("SEARCHWEBCODE_API_KEY saknas i miljön.");
  // Håll avståndet mellan anropen, så att API:et inte låser nyckeln.
  const gap = lastCall + MIN_GAP_MS - Date.now();
  if (gap > 0) await (deps.sleep ?? realSleep)(gap);
  lastCall = Date.now();
  const params = new URLSearchParams({ q: query.q, ...(query.regex ? { regex: "true" } : {}), ...(query.tld ? { tld: query.tld } : {}), ...extra });
  let res: Response;
  try {
    res = await deps.fetch(`${ENDPOINT}?${params}`, { headers: { Authorization: `Bearer ${deps.apiKey}`, Accept: "application/json" }, signal: ctx.signal });
  } catch (cause) {
    throw new CollectorError(`Kunde inte nå SearchWebCode: ${cause instanceof Error ? cause.message : "okänt fel"}`);
  }
  const body = (await res.json().catch(() => ({}))) as SwcResponse;
  if (res.status === 401 || res.status === 403) throw new CollectorError(`SearchWebCode: nyckeln avvisades (${res.status}).`);
  if (res.status === 402) throw new CollectorError("SearchWebCode: saldot räcker inte. Fyll på kontot.");
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after"));
    throw new CollectorError(`SearchWebCode: för många anrop${Number.isFinite(wait) && wait > 0 ? `, försök igen om ${Math.ceil(wait / 60)} min` : ", försök igen strax"}.`);
  }
  if (!res.ok) throw new CollectorError(`SearchWebCode svarade ${res.status}: ${errorText(body)}`);
  return body;
}

/** Antalet träffar, utan kostnad. `kind` säger om det är exakt, uppskattat eller bara en övre gräns. */
export async function countSwc(query: SwcQuery, ctx: { signal: AbortSignal }, deps: SwcDeps = defaultSwcDeps()): Promise<{ total: number | null; kind: string | null }> {
  const b = await call(query, { counts_only: "true" }, ctx, deps);
  return { total: b.total ?? b.candidate_total ?? null, kind: b.count_kind ?? null };
}

/**
 * Hämtar upp till `maxResults` domäner. Bläddrar med next_offset och slutar vid maxResults, sista sidan eller MAX_PAGES.
 * `cents` är vad sökningen kostade enligt svaren, och `truncated` om det fanns fler än vad som hämtades.
 */
export async function searchSwc(
  query: SwcQuery,
  maxResults: number,
  ctx: { signal: AbortSignal; log?: (m: string) => void },
  deps: SwcDeps = defaultSwcDeps(),
): Promise<{ domains: string[]; hits: { domain: string; url: string | null }[]; total: number | null; truncated: boolean; cents: number; pages: number }> {
  const seen = new Map<string, string | null>();
  let offset = 0;
  let total: number | null = null;
  let cents = 0;
  let pages = 0;
  let more = true;
  while (more && pages < MAX_PAGES && seen.size < maxResults) {
    const b = await call(query, { limit: String(Math.min(PAGE_SIZE, Math.max(1, maxResults - seen.size))), offset: String(offset) }, ctx, deps);
    pages++;
    total = b.total ?? total;
    cents += b.charged_cents ?? 0;
    for (const h of hitsFromResponse(b)) if (!seen.has(h.domain)) seen.set(h.domain, h.url);
    ctx.log?.(`SearchWebCode: sida ${pages}, ${seen.size} domäner hittills`);
    // Motorn kontrollerar kandidater i fönster om 256. Ett fönster utan en enda riktig träff är ingen sista sida: en sällsynt
    // sträng har många kandidater men få träffar, så bläddringen fortsätter så länge svaret pekar på ett nästa fönster.
    const next = b.next_offset;
    more = typeof next === "number" && next > offset;
    if (more) offset = next as number;
  }
  const hits = [...seen].slice(0, maxResults).map(([domain, url]) => ({ domain, url }));
  return { domains: hits.map((h) => h.domain), hits, total, truncated: more || (total !== null && total > hits.length), cents, pages };
}
