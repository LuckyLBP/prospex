import { pool } from "@/lib/db";
import { normalizeDomain, websiteUrl } from "../domain";
import { CollectorError, type CollectBatch, type CollectContext, type CollectedItem } from "../types";
import type { ScriptHandler } from "./index";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";
import { shouldSkipEnrichment } from "./prefill";

// Eniro, from the table this database already holds -- same reasoning as the
// Bokadirekt sync, different columns.
//
// ENIRO ROWS CARRY NO EMAIL ADDRESS AT ALL, which is why prefill is decided
// per row rather than per script: a row with a website is worth a visit
// precisely because that visit is the only way this profile will ever get an
// email, and a row without one has nothing to visit.

const PAGE_SIZE = 1000;

function readOffset(cursor: unknown): number {
  if (cursor && typeof cursor === "object" && "offset" in cursor) {
    const offset = Number((cursor as { offset: unknown }).offset);
    if (Number.isFinite(offset) && offset >= 0) return Math.floor(offset);
  }
  return 0;
}

export const eniroTableSync: ScriptHandler = {
  key: "eniro-table-sync",

  async *collect(ctx: CollectContext): AsyncGenerator<CollectBatch> {
    let offset = readOffset(ctx.cursor);

    while (true) {
      // Sorterat på primärnyckeln så att sidindelningen är stabil även när tabellen skrivs till.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: Record<string, any>[];
      try {
        rows = (await pool.query(`select id, eniro_id, name, phone, website, eniro_url, street, postal_code, city, category, rating_value, rating_count from src_eniro_companies order by id limit $1 offset $2`, [PAGE_SIZE, offset])).rows;
      } catch (e) {
        throw new CollectorError(`Kunde inte läsa src_eniro_companies: ${(e as Error).message}`);
      }

      const items: CollectedItem[] = rows.map((row) => {
        const domain = normalizeDomain(row.website);
        const phone = normalizeSwedishPhone(row.phone);
        return {
          dedupeKey: domain ?? `eniro:${row.eniro_id ?? row.id}`,
          domain,
          website: domain ? websiteUrl(domain) : row.website,
          sourceUrl: row.eniro_url,
          companyName: row.name,
          phone,
          email: null,
          orgnr: null,
          raw: {
            street: row.street,
            postal_code: row.postal_code,
            city: row.city,
            category: row.category,
            rating: row.rating_value,
            review_count: row.rating_count,
            source: "eniro_companies",
          },
          prefilled: shouldSkipEnrichment({ domain, email: null, phone }),
        };
      });

      offset += rows.length;
      const done = rows.length < PAGE_SIZE;
      ctx.log(`Eniro: ${offset} rader lästa`);
      yield { items, cursor: done ? null : { offset } };
      if (done) return;
    }
  },
};
