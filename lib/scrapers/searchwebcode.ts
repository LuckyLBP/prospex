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
export const MIN_GAP_MS = 2000;

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

/**
 * En PublicWWW-fråga som SearchWebCode-fråga: `"x" site:se` blir frasen "x" med tld=se. En fras med citattecken inuti
 * (href="https://a.se") citeras som en helhet, med citattecknen skyddade. Ren.
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
  if (!simple) q = `"${q.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return { q, ...(tld ? { tld } : {}) };
}

/** Domänerna ur ett svar, utan dubbletter och med www borttaget. Ren. */
export function domainsFromResponse(body: SwcResponse): string[] {
  const out = new Set<string>();
  for (const r of body.results ?? []) {
    const d = normalizeDomain(r.domain ?? r.url);
    if (d) out.add(d);
  }
  return [...out];
}

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
): Promise<{ domains: string[]; total: number | null; truncated: boolean; cents: number; pages: number }> {
  const seen = new Set<string>();
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
    for (const d of domainsFromResponse(b)) seen.add(d);
    ctx.log?.(`SearchWebCode: sida ${pages}, ${seen.size} domäner hittills`);
    const next = b.next_offset;
    more = typeof next === "number" && next > offset && (b.results?.length ?? 0) > 0;
    if (more) offset = next as number;
  }
  return { domains: [...seen].slice(0, maxResults), total, truncated: more || (total !== null && total > seen.size), cents, pages };
}
