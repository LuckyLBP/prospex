import { pool } from "@/lib/db";
import { CollectorError, type CollectBatch, type CollectContext } from "../types";
import type { ScriptHandler } from "./index";
import { parseProfile, parseSitemapProfiles, toItem, type ServiceFinderProfile } from "./servicefinder-parse";

// Servicefinder: företag med en profil på /foretag/<id>.
//
// Sitemapen har tre listor. Vi läser de aktiva och de inaktiva med omdöme; de inaktiva utan omdöme
// (cirka 33 000) är nästan alla 404 och lämnas. Sitemapen läses om vid varje omgång i stället för att
// lagras i markören, så markören är bara en position i den. Ett företag som tillkommit mitt i en körning
// förskjuter högst en handfull rader, och upserten gör en omläst rad till en uppdatering.
//
// robots.txt tillåter /foretag/ (bara /api och /graphql är spärrade). Förfrågningarna går två åt gången
// med paus emellan, med en User-Agent som säger vem vi är. En profil som är inaktiv ger 404 eller en sida
// utan företagsdata och hoppas över, och det är normalt: ett blockerande svar (403, 429) avbryter däremot
// körningen i stället för att hamras vidare.
//
// Företagen saknar webbplats här, så de matchas mot det vi redan har: på org.nr, och för enskilda firmor
// (vars personnummer sajten maskerar) på telefonnummer när exakt ett företag har det. Ett träffat företag
// behåller sin nyckel, så att det fylls på och inte dubbleras.

const SITEMAPS = [
  "https://servicefinder.se/sitemaps/businesses-active.xml",
  "https://servicefinder.se/sitemaps/businesses-inactive-with-review.xml",
];
const BATCH_SIZE = 25;
const CONCURRENCY = 2;
const PAUSE_MS = 400;
const TIMEOUT_MS = 15_000;
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

/** Nycklarna till företag vi redan har, så att ett träffat företag fylls på i stället för att dubbleras. */
async function existingKeys(profiles: ServiceFinderProfile[]): Promise<{ byOrg: Map<string, string>; byPhone: Map<string, string> }> {
  const orgs = profiles.map((p) => p.orgnr).filter((x): x is string => !!x);
  const phones = profiles.filter((p) => !p.orgnr && p.phone).map((p) => p.phone as string);
  const byOrg = new Map<string, string>();
  const byPhone = new Map<string, string>();
  if (orgs.length) {
    const { rows } = await pool.query(`select distinct on (orgnr) orgnr, dedupe_key from companies where orgnr = any($1) order by orgnr, first_seen_at`, [orgs]);
    for (const r of rows) byOrg.set(r.orgnr, r.dedupe_key);
  }
  if (phones.length) {
    const { rows } = await pool.query(`select phone, min(dedupe_key) as dedupe_key from companies where phone = any($1) group by phone having count(*) = 1`, [phones]);
    for (const r of rows) byPhone.set(r.phone, r.dedupe_key);
  }
  return { byOrg, byPhone };
}

export const servicefinder: ScriptHandler = {
  key: "servicefinder",

  async *collect(ctx: CollectContext): AsyncGenerator<CollectBatch> {
    const profiles: { id: string; url: string }[] = [];
    const seen = new Set<string>();
    for (const url of SITEMAPS) {
      const sitemap = await get(url, ctx.signal);
      if (!sitemap.text) throw new CollectorError(`Kunde inte hämta Servicefinders sitemap (${sitemap.status || "ingen kontakt"}). Försök igen om en stund.`);
      for (const p of parseSitemapProfiles(sitemap.text)) if (!seen.has(p.id)) { seen.add(p.id); profiles.push(p); }
    }
    if (profiles.length === 0) throw new CollectorError("Servicefinders sitemap innehöll inga företagsprofiler.");

    let offset = readOffset(ctx.cursor);
    ctx.log(`Servicefinder: ${profiles.length} profiler, från ${offset}`);

    while (offset < profiles.length) {
      const page = profiles.slice(offset, offset + BATCH_SIZE);
      const found: ServiceFinderProfile[] = [];

      for (let i = 0; i < page.length; i += CONCURRENCY) {
        const results = await Promise.all(
          page.slice(i, i + CONCURRENCY).map(async (p) => {
            const r = await get(p.url, ctx.signal);
            if (r.status === 403 || r.status === 429) throw new CollectorError(`Servicefinder svarade ${r.status} och vill inte ha fler förfrågningar just nu. Försök igen senare.`);
            return r.text ? parseProfile(r.text, p.id) : null;
          }),
        );
        for (const r of results) if (r) found.push(r);
        await sleep(PAUSE_MS);
      }

      const known = await existingKeys(found);
      offset += page.length;
      const done = offset >= profiles.length;
      ctx.log(`Servicefinder: ${offset}/${profiles.length} profiler lästa, ${found.length} med företagsdata i den här omgången`);
      yield { items: found.map((p) => toItem(p, known)), cursor: done ? null : { offset } };
      if (done) return;
    }
  },
};
