import { CollectorError, type CollectBatch, type Collector, type CollectContext } from "./types";
import { normalizeDomain, websiteUrl } from "./domain";
import { viewdnsConfigSchema, type ViewdnsConfig, type ViewdnsEndpoint } from "@/lib/sources/schema";

// ViewDNS reverse lookups.
//
// THE THREE ENDPOINTS DISAGREE ABOUT EVERYTHING except the host name, and
// that is the only real complexity in this file. Each takes its target under a
// different parameter, and each returns the domains under a different key with
// a different field name inside:
//
//   reverseip     ?host=  ->  response.domains[].name     10 000 per page
//   reversens     ?ns=    ->  response.domains[].domain   10 000 per page
//   reversewhois  ?q=     ->  response.matches[].domain    1 000 per page
//
// Getting one of these wrong yields an empty run rather than an error, so the
// mapping is a table with a test per endpoint rather than a chain of ifs.

const BASE = "https://api.viewdns.info";

const ENDPOINTS: Record<ViewdnsEndpoint, { param: string; list: "domains" | "matches"; field: "name" | "domain" }> =
  {
    reverseip: { param: "host", list: "domains", field: "name" },
    reversens: { param: "ns", list: "domains", field: "domain" },
    reversewhois: { param: "q", list: "matches", field: "domain" },
  };

interface ViewdnsResponse {
  response?: {
    domains?: Record<string, unknown>[];
    matches?: Record<string, unknown>[];
    // Counts come back as strings, not numbers.
    total_pages?: string | number;
    current_page?: string | number;
    domain_count?: string | number;
  };
  error?: string;
}

export interface ViewdnsDeps {
  fetch: typeof globalThis.fetch;
  apiKey: string | undefined;
}

function defaultDeps(): ViewdnsDeps {
  return { fetch: globalThis.fetch, apiKey: process.env.VIEWDNS_API_KEY };
}

/** Exported for tests: one response -> the domain strings it carries. */
export function extractDomains(endpoint: ViewdnsEndpoint, body: ViewdnsResponse): string[] {
  const spec = ENDPOINTS[endpoint];
  const rows = body.response?.[spec.list] ?? [];
  const out: string[] = [];
  for (const row of rows) {
    const value = row[spec.field];
    if (typeof value === "string" && value.trim() !== "") out.push(value);
  }
  return out;
}

/**
 * Exported for tests: did this one response already carry everything?
 *
 * reverseip answers with a `domain_count` and every domain in one go, and sends
 * no page count at all -- so a run asking for five pages fetched the same list
 * five times and paid five API calls for one answer. When the count is there
 * and the page delivered it, there is nothing on page two.
 */
export function isComplete(body: ViewdnsResponse, received: number): boolean {
  const raw = body.response?.domain_count;
  if (raw === undefined || raw === null) return false;
  const count = Number(raw);
  return Number.isFinite(count) && received >= count;
}

/** Exported for tests: how many pages this response says exist, if it says. */
export function totalPages(body: ViewdnsResponse): number | null {
  const raw = body.response?.total_pages;
  if (raw === undefined || raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

interface PageCursor {
  page: number;
}

function readCursor(cursor: unknown): PageCursor {
  if (cursor && typeof cursor === "object" && "page" in cursor) {
    const page = Number((cursor as { page: unknown }).page);
    if (Number.isFinite(page) && page >= 1) return { page: Math.floor(page) };
  }
  return { page: 1 };
}

/**
 * En sida av ett uppslag hos ViewDNS: domänerna och om det var sista sidan. Kastar CollectorError med ett svenskt
 * meddelande. Används av kollektorn och av byråkollektorn.
 */
export async function reverseLookup(
  endpoint: ViewdnsEndpoint,
  target: string,
  page: number,
  maxPages: number,
  ctx: { signal: AbortSignal; log: (message: string) => void },
  deps: ViewdnsDeps = defaultDeps(),
): Promise<{ domains: string[]; lastPage: boolean }> {
  if (!deps.apiKey) {
    throw new CollectorError("VIEWDNS_API_KEY saknas i miljön.");
  }
  const spec = ENDPOINTS[endpoint];
  const url =
    `${BASE}/${endpoint}/?${spec.param}=${encodeURIComponent(target)}` +
    `&apikey=${encodeURIComponent(deps.apiKey)}&output=json&page=${page}`;
  ctx.log(`ViewDNS ${endpoint} sida ${page}`);

  let response: Response;
  try {
    response = await deps.fetch(url, { headers: { Accept: "application/json" }, signal: ctx.signal });
  } catch (cause) {
    throw new CollectorError(`Kunde inte nå ViewDNS: ${cause instanceof Error ? cause.message : "okänt fel"}`);
  }

  if (!response.ok) {
    throw new CollectorError(`ViewDNS svarade ${response.status}.`);
  }

  let body: ViewdnsResponse;
  try {
    body = (await response.json()) as ViewdnsResponse;
  } catch {
    throw new CollectorError("ViewDNS svarade inte med JSON. Kontrollera API-nyckeln.");
  }

  if (body.error) {
    throw new CollectorError(`ViewDNS: ${body.error}`);
  }

  const domains = extractDomains(endpoint, body);
  const pages = totalPages(body);
  // An empty page is the end whatever the header claims, and a page
  // count is only trusted when the endpoint sends one.
  const lastPage = domains.length === 0 || page >= maxPages || (pages !== null && page >= pages) || isComplete(body, domains.length);
  return { domains, lastPage };
}

export interface IpRecord {
  ip: string;
  /** "ÅÅÅÅ-MM-DD" när ViewDNS såg adressen senast. */
  lastSeen: string | null;
}

/** Exported for tests: iphistory answers with response.records[] of { ip, lastseen, owner, location }. */
export function parseIpHistory(body: { response?: { records?: Record<string, unknown>[] } }): IpRecord[] {
  const out: IpRecord[] = [];
  for (const r of body.response?.records ?? []) {
    if (typeof r.ip === "string" && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(r.ip)) out.push({ ip: r.ip, lastSeen: typeof r.lastseen === "string" ? r.lastseen : null });
  }
  return out;
}

/**
 * Vilka IP-adresser en domän haft, senast sedda först. En byrå flyttar ofta sin egen sajt men kunderna blir kvar på den
 * gamla servern, så den gamla adressen är det som avslöjar dem. Kastar CollectorError med ett svenskt meddelande.
 */
export async function ipHistory(domain: string, ctx: { signal: AbortSignal; log: (message: string) => void }, deps: ViewdnsDeps = defaultDeps()): Promise<IpRecord[]> {
  if (!deps.apiKey) throw new CollectorError("VIEWDNS_API_KEY saknas i miljön.");
  ctx.log("ViewDNS iphistory");
  let response: Response;
  try {
    response = await deps.fetch(`${BASE}/iphistory/?domain=${encodeURIComponent(domain)}&apikey=${encodeURIComponent(deps.apiKey)}&output=json`, { headers: { Accept: "application/json" }, signal: ctx.signal });
  } catch (cause) {
    throw new CollectorError(`Kunde inte nå ViewDNS: ${cause instanceof Error ? cause.message : "okänt fel"}`);
  }
  if (!response.ok) throw new CollectorError(`ViewDNS svarade ${response.status}.`);
  let body: { response?: { records?: Record<string, unknown>[] }; error?: string };
  try {
    body = await response.json();
  } catch {
    throw new CollectorError("ViewDNS svarade inte med JSON. Kontrollera API-nyckeln.");
  }
  if (body.error) throw new CollectorError(`ViewDNS: ${body.error}`);
  return parseIpHistory(body).sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

export function createViewdnsCollector(deps: ViewdnsDeps = defaultDeps()): Collector<ViewdnsConfig> {
  return {
    method: "viewdns",

    parseConfig(raw) {
      const parsed = viewdnsConfigSchema.safeParse(raw);
      if (!parsed.success) {
        throw new CollectorError("Profilens ViewDNS-inställningar är ofullständiga. Redigera profilen.");
      }
      return parsed.data;
    },

    async *collect(config: ViewdnsConfig, ctx: CollectContext) {
      let { page } = readCursor(ctx.cursor);

      while (page <= config.maxPages) {
        const { domains: raw, lastPage } = await reverseLookup(config.endpoint, config.target, page, config.maxPages, ctx, deps);
        const seen = new Set<string>();
        const items: CollectBatch["items"] = [];
        for (const value of raw) {
          const domain = normalizeDomain(value);
          if (!domain || seen.has(domain)) continue;
          seen.add(domain);
          items.push({
            dedupeKey: domain,
            domain,
            website: websiteUrl(domain),
            prefilled: false,
          });
        }

        page += 1;
        yield { items, cursor: lastPage ? null : { page } };
        if (lastPage) return;
      }
    },
  };
}
