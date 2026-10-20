import { audit } from "@/lib/audit";
import { invalidateCatalogue } from "@/lib/catalogue-tag";
import { pool } from "@/lib/db";

// Publicerar en byrås kundlista när en körning som ett bolag bett om blivit klar. Varje kund i listan har redan klarat
// kontrollen mot sin egen sida (verify.ts), men en tom eller nästan tom lista ska aldrig nå kunderna.

/** Så många verifierade kunder krävs för att listan publiceras av sig själv. */
export const MIN_PUBLISH_CUSTOMERS = 5;

/** Publicerar källan om någon bett om den och den har tillräckligt många kunder. Returnerar om den publicerades. */
export async function autoPublishRequested(supplierId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `update suppliers s set published = true, updated_at = now()
       where s.id = $1 and s.method = 'agency' and not s.published
         and exists (select 1 from list_requests r where r.supplier_id = s.id)
         and (select count(*) from company_signals cs where cs.supplier_id = s.id) >= $2
       returning s.slug, s.name, s.kind, (select count(*)::int from company_signals cs where cs.supplier_id = s.id) as customers`,
      [supplierId, MIN_PUBLISH_CUSTOMERS],
    );
    const s = rows[0];
    if (!s) return false;
    invalidateCatalogue();
    await audit({ id: null, email: "system" }, "source.autopublish", "source", { id: s.slug, name: s.name, details: { kind: s.kind, customers: s.customers } });
    return true;
  } catch (e) {
    // Utan tabellen (migrationen 0025 inte körd) eller vid ett fel stannar listan opublicerad för en admin att granska.
    console.error("[kundlista] kunde inte publicera automatiskt:", e instanceof Error ? e.message : e);
    return false;
  }
}
