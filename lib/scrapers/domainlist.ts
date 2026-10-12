import { CollectorError, type CollectBatch, type Collector, type CollectContext } from "./types";
import { normalizeDomain, websiteUrl } from "./domain";
import { domainlistConfigSchema, type DomainlistConfig } from "@/lib/sources/schema";

// Domänlista: profilen bär själv sina domäner.
//
// Metoden finns för källor som inte går att KÄNNA IGEN. En byrås sajter avslöjar
// sig nästan alltid av något -- en sidfotslänk, ett temanamn, en delad server --
// och då hör profilen hemma i PublicWWW eller ViewDNS, som hämtar en färsk lista
// varje körning. För resten är listan i sig det enda beläggt som finns, och en
// profil som bär den kan ändå berikas, ringlistas och arkiveras ur.
//
// Insamlingen träffar ingenting utifrån: paginering finns för att en lista på
// tiotusen rader inte ska bli en enda upsert, och för att en körning som slår i
// tidsbudgeten ska kunna fortsätta där den slutade.

const PAGE_SIZE = 500;

interface DomainlistCursor {
  offset: number;
}

function readCursor(raw: unknown): DomainlistCursor {
  if (raw && typeof raw === "object" && "offset" in raw) {
    const offset = Number((raw as { offset: unknown }).offset);
    if (Number.isInteger(offset) && offset >= 0) return { offset };
  }
  return { offset: 0 };
}

/**
 * Exported for tests: the text someone pasted -> unique, normalised domains.
 *
 * Splits on anything a pasted list separates rows with (newline, comma,
 * semicolon, tab), so a column copied out of a spreadsheet and a hand-typed
 * list arrive at the same place. Everything `normalizeDomain` rejects is
 * dropped silently -- a heading row or a stray "-" is not an error the person
 * pasting needs to hear about.
 */
export function parseDomains(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) {
    const domain = normalizeDomain(part);
    if (domain) seen.add(domain);
  }
  return [...seen];
}

export function createDomainlistCollector(): Collector<DomainlistConfig> {
  return {
    method: "domainlist",

    parseConfig(raw) {
      const parsed = domainlistConfigSchema.safeParse(raw);
      if (!parsed.success) {
        throw new CollectorError("Profilens domänlista är tom. Redigera profilen.");
      }
      return parsed.data;
    },

    async *collect(config: DomainlistConfig, ctx: CollectContext): AsyncGenerator<CollectBatch> {
      const domains = parseDomains(config.domains);
      if (domains.length === 0) {
        // The field cannot be empty, so this means every line was unusable --
        // which is worth saying out loud instead of finishing with zero records.
        throw new CollectorError("Ingen rad i domänlistan gick att läsa som en domän.");
      }

      let { offset } = readCursor(ctx.cursor);
      ctx.log(`Domänlista: ${domains.length} domäner, från ${offset}`);

      while (offset < domains.length) {
        const page = domains.slice(offset, offset + PAGE_SIZE);
        offset += page.length;
        const done = offset >= domains.length;

        yield {
          items: page.map((domain) => ({
            dedupeKey: domain,
            domain,
            website: websiteUrl(domain),
            prefilled: false,
          })),
          cursor: done ? null : { offset },
        };

        if (done) return;
      }
    },
  };
}
