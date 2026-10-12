import { pool } from "@/lib/db";
import { normalizeDomain, websiteUrl } from "../domain";
import { CollectorError, type CollectBatch, type CollectContext, type CollectedItem } from "../types";
import type { ScriptHandler } from "./index";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";
import { shouldSkipEnrichment } from "./prefill";

// Bokadirekt, from the table this database already holds.
//
// src_bokadirekt_companies (16 708 rows) predates this app: it is the output of a
// one-off scrape whose code is nowhere in this repository. Re-scraping the
// site to get data that is already here would be slower, ruder and no more
// accurate, so this "script" collects from the table instead -- which is
// exactly what the custom-script method is for.
//
// The rows arrive with a name, a phone number and often an email, so most
// items are `prefilled` and cost no website visit. The ones still missing an
// email keep their place in the enrichment queue -- see prefill.ts.

const PAGE_SIZE = 1000;

function readOffset(cursor: unknown): number {
  if (cursor && typeof cursor === "object" && "offset" in cursor) {
    const offset = Number((cursor as { offset: unknown }).offset);
    if (Number.isFinite(offset) && offset >= 0) return Math.floor(offset);
  }
  return 0;
}

export const bokadirektTableSync: ScriptHandler = {
  key: "bokadirekt-table-sync",

  async *collect(ctx: CollectContext): AsyncGenerator<CollectBatch> {
    let offset = readOffset(ctx.cursor);

    while (true) {
      // Sorterat på primärnyckeln så att sidindelningen är stabil även när tabellen skrivs till.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: Record<string, any>[];
      try {
        rows = (await pool.query(`select id, name, phone, email, website, bokadirekt_url, street, postal_code, city, rating, review_count from src_bokadirekt_companies order by id limit $1 offset $2`, [PAGE_SIZE, offset])).rows;
      } catch (e) {
        throw new CollectorError(`Kunde inte läsa src_bokadirekt_companies: ${(e as Error).message}`);
      }

      const items: CollectedItem[] = rows.map((row) => {
        const domain = normalizeDomain(row.website);
        const phone = normalizeSwedishPhone(row.phone);
        return {
          // A salon without a website still deserves a stable identity, and
          // its Bokadirekt page is one.
          dedupeKey: domain ?? `bokadirekt:${row.id}`,
          domain,
          website: domain ? websiteUrl(domain) : row.website,
          sourceUrl: row.bokadirekt_url,
          companyName: row.name,
          phone,
          email: row.email,
          orgnr: null,
          raw: {
            street: row.street,
            postal_code: row.postal_code,
            city: row.city,
            rating: row.rating,
            review_count: row.review_count,
            source: "bokadirekt_companies",
          },
          prefilled: shouldSkipEnrichment({ domain, email: row.email, phone }),
        };
      });

      offset += rows.length;
      const done = rows.length < PAGE_SIZE;
      ctx.log(`Bokadirekt: ${offset} rader lästa`);
      yield { items, cursor: done ? null : { offset } };
      if (done) return;
    }
  },
};
