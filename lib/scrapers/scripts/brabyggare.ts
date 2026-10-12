import { CollectorError, type CollectBatch, type CollectContext, type CollectedItem } from "../types";
import type { ScriptHandler } from "./index";
import { parseProfilePage, parseProfileUrls } from "./brabyggare-parse";

// BraByggare: every contractor listed on brabyggare.se.
//
// The sitemap lists each public profile under /hantverkare/<id>/ (529 of them
// in September 2026). The sitemap is re-read on every invocation rather than
// stored in the cursor, so the cursor is only an offset into it -- a profile
// added mid-run shifts at most a handful of rows, and the upsert makes a
// re-read row an update rather than a duplicate.
//
// robots.txt allows /hantverkare/. Requests go a few at a time with the same
// identifying user agent the enrichment uses.

const SITEMAP_URL = "https://www.brabyggare.se/sitemap.xml";
const BATCH_SIZE = 25;
const CONCURRENCY = 4;
const TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; EffektivMediaBot/1.0; +https://effektivmedia.nu)";

function readOffset(cursor: unknown): number {
  if (cursor && typeof cursor === "object" && "offset" in cursor) {
    const offset = Number((cursor as { offset: unknown }).offset);
    if (Number.isFinite(offset) && offset >= 0) return Math.floor(offset);
  }
  return 0;
}

async function fetchText(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "sv-SE,sv;q=0.9" },
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

export const brabyggare: ScriptHandler = {
  key: "brabyggare",

  async *collect(ctx: CollectContext): AsyncGenerator<CollectBatch> {
    const sitemap = await fetchText(SITEMAP_URL, ctx.signal);
    if (!sitemap) {
      throw new CollectorError("Kunde inte hämta BraByggares sitemap. Försök igen om en stund.");
    }

    const urls = parseProfileUrls(sitemap);
    if (urls.length === 0) {
      throw new CollectorError("BraByggares sitemap innehöll inga hantverkarprofiler.");
    }

    let offset = readOffset(ctx.cursor);
    ctx.log(`BraByggare: ${urls.length} profiler, från ${offset}`);

    while (offset < urls.length) {
      const page = urls.slice(offset, offset + BATCH_SIZE);
      const items: CollectedItem[] = [];

      for (let i = 0; i < page.length; i += CONCURRENCY) {
        const results = await Promise.all(
          page.slice(i, i + CONCURRENCY).map(async (url) => {
            const html = await fetchText(url, ctx.signal);
            return html ? parseProfilePage(html, url) : null;
          }),
        );
        for (const item of results) if (item) items.push(item);
      }

      offset += page.length;
      const done = offset >= urls.length;
      ctx.log(`BraByggare: ${offset}/${urls.length} profiler lästa`);
      yield { items, cursor: done ? null : { offset } };
      if (done) return;
    }
  },
};
