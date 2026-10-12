import { CollectorError, type CollectBatch, type CollectContext } from "../types";
import type { ScriptHandler } from "./index";
import { parseProfile, parseProfileLinks, toItem, type DorunnerProfile } from "./dorunner-parse";

// Dorunner: företagen i "Företagskatalogen" på /katalog.
//
// Katalogen listar 550 företag på 11 sidor (?page=N), sitemapen 424 profiler, och de överlappar bara delvis
// (tillsammans 559). Vi tar unionen. Listan byggs om vid varje omgång (cirka 13 sidor) i stället för att
// lagras i markören, så markören är bara en position i den; upserten gör en omläst rad till en uppdatering.
//
// robots.txt tillåter /katalog och /företag/ (spärrat är bland annat /företag/*/revie*, som vi inte rör).
// Förfrågningarna går två åt gången med paus emellan, med en User-Agent som säger vem vi är. Ett blockerande
// svar (403, 429) avbryter körningen i stället för att hamras vidare.
//
// Telefon och org.nr på sidorna är Dorunners egna, så profilen ger bara namn, betyg och webbplats. Företag med
// webbplats köas för berikning, som hittar telefon, e-post och org.nr; de utan hamnar under ett eget id.

const ORIGIN = "https://www.dorunner.se";
const SITEMAP_INDEX = `${ORIGIN}/sitemap/sitemap.xml`;
const MAX_CATALOG_PAGES = 40;
const BATCH_SIZE = 25;
const CONCURRENCY = 2;
const PAUSE_MS = 400;
const TIMEOUT_MS = 20_000;
const USER_AGENT = "Mozilla/5.0 (compatible; ProspexBot/1.0; +https://prospex.se)";

function readOffset(cursor: unknown): number {
  if (cursor && typeof cursor === "object" && "offset" in cursor) {
    const offset = Number((cursor as { offset: unknown }).offset);
    if (Number.isFinite(offset) && offset >= 0) return Math.floor(offset);
  }
  return 0;
}

async function get(url: string, signal: AbortSignal): Promise<{ status: number; text: string | null }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "sv-SE,sv;q=0.9" },
    });
    return { status: response.status, text: response.ok ? await response.text() : null };
  } catch {
    return { status: 0, text: null };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function blocked(status: number): void {
  if (status === 403 || status === 429) throw new CollectorError(`Dorunner svarade ${status} och vill inte ha fler förfrågningar just nu. Försök igen senare.`);
}

async function listProfiles(signal: AbortSignal): Promise<{ id: string; url: string }[]> {
  const byId = new Map<string, { id: string; url: string }>();
  const add = (list: { id: string; url: string }[]) => {
    let added = 0;
    for (const p of list) if (!byId.has(p.id)) { byId.set(p.id, p); added++; }
    return added;
  };

  // Katalogsidorna tills en sida inte ger något nytt.
  for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
    const r = await get(`${ORIGIN}/katalog?page=${page}`, signal);
    blocked(r.status);
    if (!r.text) {
      if (page === 1) throw new CollectorError(`Kunde inte hämta Dorunners katalog (${r.status || "ingen kontakt"}). Försök igen om en stund.`);
      break;
    }
    if (add(parseProfileLinks(r.text)) === 0) break;
    await sleep(PAUSE_MS);
  }

  // Sitemapens profiler, för de som katalogen inte visar.
  const index = await get(SITEMAP_INDEX, signal);
  blocked(index.status);
  const sitemaps = [...(index.text ?? "").matchAll(/<loc>\s*([^<\s]*profiles_\d+\.xml)\s*<\/loc>/gi)].map((m) => m[1]);
  for (const url of sitemaps) {
    const r = await get(url, signal);
    blocked(r.status);
    if (r.text) add(parseProfileLinks(r.text));
    await sleep(PAUSE_MS);
  }

  return [...byId.values()];
}

export const dorunner: ScriptHandler = {
  key: "dorunner",

  async *collect(ctx: CollectContext): AsyncGenerator<CollectBatch> {
    const profiles = await listProfiles(ctx.signal);
    if (profiles.length === 0) throw new CollectorError("Dorunners katalog innehöll inga företag.");

    let offset = readOffset(ctx.cursor);
    ctx.log(`Dorunner: ${profiles.length} profiler, från ${offset}`);

    while (offset < profiles.length) {
      const page = profiles.slice(offset, offset + BATCH_SIZE);
      const found: DorunnerProfile[] = [];

      for (let i = 0; i < page.length; i += CONCURRENCY) {
        const results = await Promise.all(
          page.slice(i, i + CONCURRENCY).map(async (p) => {
            const r = await get(p.url, ctx.signal);
            blocked(r.status);
            return r.text ? parseProfile(r.text, p.id, p.url) : null;
          }),
        );
        for (const r of results) if (r) found.push(r);
        await sleep(PAUSE_MS);
      }

      offset += page.length;
      const done = offset >= profiles.length;
      ctx.log(`Dorunner: ${offset}/${profiles.length} profiler lästa, ${found.length} med data i den här omgången`);
      yield { items: found.map(toItem), cursor: done ? null : { offset } };
      if (done) return;
    }
  },
};
