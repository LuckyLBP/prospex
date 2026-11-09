import { CollectorError } from "@/lib/scrapers/types";
import { agencyBrands, isSameOrSubdomain, type Agency } from "./match";
import { customerDomainOf } from "./site-reader";

// Webbsökning (Brave Search) som källa till kundförslag: sidor som nämner byrån i en kreditrad ("Skapad av ...") eller
// länkar till dess domän. Brave tar betalt per sökning, så antalet är litet och dygnet har ett tak (se spend.ts).
// Träffarna är bara förslag: verify.ts hämtar kandidatens EGEN sida och kräver att byrån syns där, så en katalog, en
// konkurrent eller en pressrelease som nämner byrån blir aldrig en kund.

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
/** Antal sökningar per byrå och körning. */
export const MAX_SEARCH_QUERIES = 4;
/** Cirka kostnad per sökning i kronor (5 USD per 1 000 sökningar). */
export const SEARCH_QUERY_SEK = 0.05;
/** Träffar per sökning. Brave ger högst 20. */
const COUNT = 20;
const CREDIT_PHRASES = ["Skapad av", "Byggd av", "Webbdesign av"];

export interface SearchHit {
  domain: string;
  /** Sidan som nämnde byrån. Verifieringen tittar också på den. */
  url: string;
}

/** Sökfrågorna för en byrå: vilka sidor länkar till domänen, och några kreditfraser med byråns namn. Ren. */
export function searchQueries(agency: Agency): string[] {
  const brand = agencyBrands(agency)[0];
  const queries = [`"${agency.domain}" -site:${agency.domain}`];
  if (brand) for (const phrase of CREDIT_PHRASES) queries.push(`"${phrase} ${brand}" -site:${agency.domain}`);
  return queries.slice(0, MAX_SEARCH_QUERIES);
}

interface BraveResponse {
  web?: { results?: { url?: string }[] };
}

/** Träffarna ur ett svar som kandidater, utan byråns egna sidor, sociala medier och dubbletter. Ren. */
export function hitsFromResponse(body: BraveResponse, agency: Agency): SearchHit[] {
  const out: SearchHit[] = [];
  for (const r of body.web?.results ?? []) {
    if (!r.url) continue;
    const domain = customerDomainOf(r.url, agency);
    if (!domain || isSameOrSubdomain(domain, agency.domain)) continue;
    out.push({ domain, url: r.url });
  }
  return out;
}

export interface SearchDeps {
  fetch: typeof globalThis.fetch;
  apiKey: string | undefined;
}
export const defaultSearchDeps = (): SearchDeps => ({ fetch: globalThis.fetch, apiKey: process.env.BRAVE_SEARCH_API_KEY });
export const isSearchConfigured = (d: SearchDeps = defaultSearchDeps()): boolean => !!d.apiKey;

/**
 * Kör byråns sökfrågor. Ger träffarna (en per domän) och antalet sökningar som faktiskt gjordes, för kostnaden.
 * En fråga som felar hoppas över; kvoten slut (429) eller fel nyckel (401/403) avbryter hela steget.
 */
export async function searchAgencyMentions(
  agency: Agency,
  ctx: { signal: AbortSignal; log: (message: string) => void },
  deps: SearchDeps = defaultSearchDeps(),
): Promise<{ hits: SearchHit[]; queries: number }> {
  if (!deps.apiKey) throw new CollectorError("BRAVE_SEARCH_API_KEY saknas i miljön.");
  const hits = new Map<string, SearchHit>();
  let queries = 0;
  for (const q of searchQueries(agency)) {
    const url = `${ENDPOINT}?${new URLSearchParams({ q, count: String(COUNT), country: "SE", search_lang: "sv" })}`;
    let res: Response;
    try {
      res = await deps.fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": deps.apiKey }, signal: ctx.signal });
    } catch (cause) {
      throw new CollectorError(`Kunde inte nå Brave Search: ${cause instanceof Error ? cause.message : "okänt fel"}`);
    }
    queries++;
    if ([401, 403, 429].includes(res.status)) throw new CollectorError(`Brave Search svarade ${res.status}${res.status === 429 ? " (kvoten är slut)" : ", kontrollera nyckeln"}.`);
    if (!res.ok) {
      ctx.log(`Byrå ${agency.name}: sökningen ${q} gav ${res.status}`);
      continue;
    }
    let body: BraveResponse;
    try {
      body = (await res.json()) as BraveResponse;
    } catch {
      continue;
    }
    for (const h of hitsFromResponse(body, agency)) if (!hits.has(h.domain)) hits.set(h.domain, h);
    ctx.log(`Byrå ${agency.name}: sökningen ${q} gav ${hits.size} domäner hittills`);
  }
  return { hits: [...hits.values()], queries };
}
