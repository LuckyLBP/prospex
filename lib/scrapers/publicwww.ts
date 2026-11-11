import type { CollectBatch, Collector, CollectContext } from "./types";
import { normalizeDomain, websiteUrl } from "./domain";
import { publicwwwConfigSchema, type PublicwwwConfig } from "@/lib/sources/schema";
import { searchCode, type CodeSearchDeps } from "./codesearch";
import { CollectorError } from "./types";

// Källkodssökningen som insamlingsmetod: "vilka sajter har den här strängen i sin källkod". Metodens namn i databasen är
// fortfarande "publicwww" (det står i tabellen suppliers och i alla sparade profiler), men sökningen görs hos
// SearchWebCode (codesearch.ts). Frågorna skrivs som en fras, med site:se för bara svenska sajter.
//
// EN SÖKNING PER KÖRNING: en sökning kostar en kredit och täcker frågan och upp till 25 sidor, så det billigaste är att
// hämta allt som planen ger i ett svep. Antalet per månad har ett hårt tak (search-usage.ts).

interface CodeResponse {
  results?: { domain?: string | null; url?: string | null }[];
  truncated?: boolean;
}

/** Exported for tests: the mapping from one search to items. */
export function itemsFromResponse(body: CodeResponse): CollectBatch {
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
      // Everything else is unknown at this point: the search answers with domains, and the enrichment pass is what
      // turns one into a company.
      prefilled: false,
    });
  }

  return { items, cursor: null, truncated: body.truncated === true };
}

export function createPublicwwwCollector(deps: CodeSearchDeps = {}): Collector<PublicwwwConfig> {
  return {
    method: "publicwww",

    parseConfig(raw) {
      const parsed = publicwwwConfigSchema.safeParse(raw);
      if (!parsed.success) {
        throw new CollectorError("Profilens inställningar för källkodssökning är ofullständiga. Redigera profilen.");
      }
      return parsed.data;
    },

    async *collect(config: PublicwwwConfig, ctx: CollectContext) {
      const r = await searchCode(config.query, config.maxResults, ctx, deps);
      yield itemsFromResponse({ results: r.hits, truncated: r.truncated });
    },
  };
}
