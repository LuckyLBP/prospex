import { CollectorError, type CollectBatch, type Collector, type CollectContext } from "./types";
import { normalizeDomain, websiteUrl } from "./domain";
import { publicwwwConfigSchema, type PublicwwwConfig } from "@/lib/sources/schema";

// PublicWWW: "which sites have this string in their source code".
//
// ONE SEARCH PER RUN, and that is a hard constraint rather than a
// simplification. The API allows two requests per thirty seconds, so paging
// would mean a collector that sleeps fifteen seconds between pages inside a
// serverless invocation that is billed by the second. `per_page` goes up to a
// million on paid plans, so a single request is also the cheapest way to ask
// for everything the plan will disclose.
//
// The plan's depth cap is reported rather than hidden: when PublicWWW answers
// `truncated: true` the run says so, so a thin result reads as "your plan
// stops here" instead of "the source only had 500 sites".

const ENDPOINT = "https://api.publicwww.com/v1/search";

// The two-per-thirty-seconds limit is per API KEY, not per run. An admin who
// clicks "Kör nu" on several sources in a row starts runs that share one
// window, and every run after the second used to fail within a second. A burst
// answer says how long to wait, so the run waits and asks again. Four attempts
// at up to 35 s each stay well inside the worker's 240 s budget.
const MAX_ATTEMPTS = 4;
const MAX_WAIT_S = 35;

interface PublicwwwResponse {
  total?: number;
  returned?: number;
  truncated?: boolean;
  results?: { domain?: string | null; url?: string | null }[];
  error?: { code?: string; message?: string; retry_after?: number; plan?: string };
}

export interface PublicwwwDeps {
  fetch: typeof globalThis.fetch;
  apiKey: string | undefined;
  /** Injected so tests do not wait out a real rate-limit window. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

function defaultDeps(): PublicwwwDeps {
  return { fetch: globalThis.fetch, apiKey: process.env.PUBLICWWW_API_KEY };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Exported for tests: the mapping from one API response to items. */
export function itemsFromResponse(body: PublicwwwResponse): CollectBatch {
  const items = [];
  const seen = new Set<string>();

  for (const result of body.results ?? []) {
    const domain = normalizeDomain(result.domain ?? result.url);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    items.push({
      dedupeKey: domain,
      domain,
      website: websiteUrl(domain),
      sourceUrl: result.url ?? null,
      // Everything else is unknown at this point: PublicWWW answers with
      // domains, and the enrichment pass is what turns one into a company.
      prefilled: false,
    });
  }

  return { items, cursor: null, truncated: body.truncated === true };
}

/**
 * Ett sökanrop mot PublicWWW, med väntan och omförsök när gränsen på två anrop per trettio sekunder nås. Kastar
 * CollectorError med ett svenskt meddelande. Används både av kollektorn och av byråkollektorn.
 */
export async function searchPublicwww(
  query: string,
  maxResults: number,
  ctx: { signal: AbortSignal; log: (message: string) => void },
  deps: PublicwwwDeps = defaultDeps(),
): Promise<PublicwwwResponse> {
  if (!deps.apiKey) {
    throw new CollectorError("PUBLICWWW_API_KEY saknas i miljön.");
  }

  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&per_page=${maxResults}`;
  ctx.log(`PublicWWW: ${query} (max ${maxResults})`);

  const wait = deps.sleep ?? sleep;
  let response: Response;
  for (let attempt = 1; ; attempt++) {
    try {
      response = await deps.fetch(url, {
        headers: { Authorization: `Bearer ${deps.apiKey}`, Accept: "application/json" },
        signal: ctx.signal,
      });
    } catch (cause) {
      throw new CollectorError(
        `Kunde inte nå PublicWWW: ${cause instanceof Error ? cause.message : "okänt fel"}`,
      );
    }

    if (response.status !== 429) break;

    const body = (await response.json().catch(() => ({}))) as PublicwwwResponse;
    if (body.error?.code === "quota_exceeded") {
      throw new CollectorError("PublicWWW: kvoten är slut för perioden.");
    }

    const retry = body.error?.retry_after;
    if (attempt >= MAX_ATTEMPTS) {
      throw new CollectorError(
        `PublicWWW: för många anrop${retry ? `, försök igen om ${retry} sekunder` : ""}.`,
      );
    }

    // One second past what the API asked for, so the retry does not land
    // on the exact edge of the window it was told to wait out.
    const seconds = Math.min((retry ?? 15) + 1, MAX_WAIT_S);
    ctx.log(`PublicWWW: för många anrop, väntar ${seconds} s (försök ${attempt}/${MAX_ATTEMPTS})`);
    await wait(seconds * 1000, ctx.signal);
  }

  // 403 plan_required is the plan's own ceiling, not a broken key: the
  // account has spent what it may spend, or the query needs a tier this key
  // does not have. "PublicWWW svarade 403." would send the next reader
  // looking at the API key, which is the one thing that is fine.
  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as PublicwwwResponse;
    throw new CollectorError(
      body.error?.code === "plan_required"
        ? "PublicWWW: kontots plan räcker inte till den här frågan, eller så är periodens anrop slut."
        : "PublicWWW nekade anropet (403). Kontrollera API-nyckeln.",
    );
  }

  if (!response.ok) {
    throw new CollectorError(`PublicWWW svarade ${response.status}.`);
  }

  let body: PublicwwwResponse;
  try {
    body = (await response.json()) as PublicwwwResponse;
  } catch {
    // A JSON endpoint answering with something else is almost always a
    // login or block page, and "Unexpected token <" would not say so.
    throw new CollectorError("PublicWWW svarade inte med JSON. Kontrollera API-nyckeln.");
  }
  return body;
}

export function createPublicwwwCollector(deps: PublicwwwDeps = defaultDeps()): Collector<PublicwwwConfig> {
  return {
    method: "publicwww",

    parseConfig(raw) {
      const parsed = publicwwwConfigSchema.safeParse(raw);
      if (!parsed.success) {
        throw new CollectorError("Profilens PublicWWW-inställningar är ofullständiga. Redigera profilen.");
      }
      return parsed.data;
    },

    async *collect(config: PublicwwwConfig, ctx: CollectContext) {
      yield itemsFromResponse(await searchPublicwww(config.query, config.maxResults, ctx, deps));
    },
  };
}
