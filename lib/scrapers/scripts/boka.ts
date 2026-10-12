import { pool } from "@/lib/db";
import { CollectorError, type CollectBatch, type CollectContext } from "../types";
import type { ScriptHandler } from "./index";
import { parseProfile, parseSitemapSlugs, toItem, type BokaProfile } from "./boka-parse";

// Boka.se: företag med en egen bokningssida på boka.se/<namn>.
//
// Sitemapen (sitemap-bookingsystems.xml) listar bokningssidorna (cirka 860). Den läses om vid varje omgång i
// stället för att lagras i markören, så markören är bara en position i den; upserten gör en omläst rad till en
// uppdatering. Eventsidorna (/event/...) och kategorisidorna (där leverantörerna laddas i webbläsaren) ingår inte.
//
// robots.txt tillåter bokningssidorna (spärrat är bland annat /mypage, /calendar och /login). Förfrågningarna går
// två åt gången med paus emellan, med en User-Agent som säger vem vi är. En sida som inte finns längre hoppas
// över, medan ett blockerande svar (403, 429) avbryter körningen i stället för att hamras vidare.
//
// Sidorna ger namn, telefon, adress och webbplats, men varken org.nr eller e-post. Webbplatsen köas för
// berikning, som hittar resten. Utan webbplats matchas företaget mot det vi har på telefonnumret.

const SITEMAP = "https://boka.se/sitemap-bookingsystems.xml";
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

/** Telefonnummer som exakt ett företag hos oss har, för företag utan webbplats. */
async function phoneKeys(profiles: BokaProfile[]): Promise<Map<string, string>> {
  const phones = profiles.filter((p) => !p.domain && p.phone).map((p) => p.phone as string);
  const out = new Map<string, string>();
  if (phones.length === 0) return out;
  const { rows } = await pool.query(`select phone, min(dedupe_key) as dedupe_key from companies where phone = any($1) group by phone having count(*) = 1`, [phones]);
  for (const r of rows) out.set(r.phone, r.dedupe_key);
  return out;
}

export const boka: ScriptHandler = {
  key: "boka",

  async *collect(ctx: CollectContext): AsyncGenerator<CollectBatch> {
    const sitemap = await get(SITEMAP, ctx.signal);
    if (!sitemap.text) throw new CollectorError(`Kunde inte hämta Boka.ses sitemap (${sitemap.status || "ingen kontakt"}). Försök igen om en stund.`);
    const pages = parseSitemapSlugs(sitemap.text);
    if (pages.length === 0) throw new CollectorError("Boka.ses sitemap innehöll inga bokningssidor.");

    let offset = readOffset(ctx.cursor);
    ctx.log(`Boka.se: ${pages.length} sidor, från ${offset}`);

    while (offset < pages.length) {
      const page = pages.slice(offset, offset + BATCH_SIZE);
      const found: BokaProfile[] = [];

      for (let i = 0; i < page.length; i += CONCURRENCY) {
        const results = await Promise.all(
          page.slice(i, i + CONCURRENCY).map(async (p) => {
            const r = await get(p.url, ctx.signal);
            if (r.status === 403 || r.status === 429) throw new CollectorError(`Boka.se svarade ${r.status} och vill inte ha fler förfrågningar just nu. Försök igen senare.`);
            return r.text ? parseProfile(r.text, p.slug) : null;
          }),
        );
        for (const r of results) if (r) found.push(r);
        await sleep(PAUSE_MS);
      }

      const byPhone = await phoneKeys(found);
      offset += page.length;
      const done = offset >= pages.length;
      ctx.log(`Boka.se: ${offset}/${pages.length} sidor lästa, ${found.length} med data i den här omgången`);
      yield { items: found.map((p) => toItem(p, byPhone)), cursor: done ? null : { offset } };
      if (done) return;
    }
  },
};
