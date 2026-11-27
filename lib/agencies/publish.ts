import { audit } from "@/lib/audit";
import { invalidateCatalogue } from "@/lib/catalogue-tag";
import { pool } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { listPublishedEmail, type Email } from "@/lib/email/templates";

// Publicerar en byrås kundlista när en körning som ett bolag bett om blivit klar. Varje kund i listan har redan klarat
// kontrollen mot sin egen sida (verify.ts), men en tom eller nästan tom lista ska aldrig nå kunderna. Kunder som bara har
// "samma spår i koden" räknas inte med: ett spår är en ledtråd, så listan måste hålla på kreditrader och liknande belägg.
// De som bett om listan får sedan ett mejl.

/** Så många verifierade kunder krävs för att en lista någon bett om med knappen publiceras av sig själv. */
export const MIN_PUBLISH_CUSTOMERS = 5;
/** En lista som spaningen sökt av sig själv (ingen har bett om den) publiceras bara vid fler än 20 kunder. */
export const MIN_AUTO_PUBLISH_CUSTOMERS = 21;

export type Send = (to: string, mail: Email) => Promise<void>;

/** Publicerar källan om någon bett om den och den har tillräckligt många kunder. Returnerar om den publicerades. */
export async function autoPublishRequested(supplierId: string, send: Send = sendEmail): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `update suppliers s set published = true, updated_at = now()
       where s.id = $1 and s.method = 'agency' and not s.published
         and exists (
           select 1 from list_requests r where r.supplier_id = s.id
             and (select count(*) from company_signals cs where cs.supplier_id = s.id and coalesce(cs.raw->>'confidence', '') <> 'pattern')
                 >= case when r.auto then $3::int else $2::int end)
       returning s.slug, s.name, s.kind, (select count(*)::int from company_signals cs where cs.supplier_id = s.id) as customers`,
      [supplierId, MIN_PUBLISH_CUSTOMERS, MIN_AUTO_PUBLISH_CUSTOMERS],
    );
    const s = rows[0];
    if (!s) return false;
    invalidateCatalogue();
    await audit({ id: null, email: "system" }, "source.autopublish", "source", { id: s.slug, name: s.name, details: { kind: s.kind, customers: s.customers } });
    await notifyRequesters(supplierId, { slug: s.slug, name: s.name, customers: s.customers }, send);
    return true;
  } catch (e) {
    // Utan tabellen (migrationen 0025 inte körd) eller vid ett fel stannar listan opublicerad för en admin att granska.
    console.error("[kundlista] kunde inte publicera automatiskt:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Mejlar dem som bett om listan och fortfarande är aktiva i bolaget. Raden märks innan mejlet går, så att ingen får det
 * två gånger. Går det inte att skicka tas märket bort och felet loggas. Kastar aldrig: listan är redan publicerad.
 */
export async function notifyRequesters(supplierId: string, list: { slug: string; name: string; customers: number }, send: Send = sendEmail): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  try {
    const { rows } = await pool.query(
      `update list_requests r set notified_at = now()
       from profiles p, memberships m, organizations o
       where r.supplier_id = $1 and r.notified_at is null
         and p.user_id = r.requested_by and p.active
         and m.user_id = p.user_id and m.org_id = r.org_id
         and o.id = r.org_id and o.active
       returning r.id, r.domain, p.email::text as email, coalesce(nullif(p.full_name, ''), split_part(p.email::text, '@', 1)) as name`,
      [supplierId],
    );
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://prospex.se").replace(/\/$/, "");
    for (const r of rows) {
      try {
        await send(r.email, listPublishedEmail({ name: r.name, list: list.name, domain: r.domain, customers: list.customers, url: `${base}/app/leverantorer/${list.slug}` }));
        result.sent++;
      } catch (e) {
        result.failed++;
        console.error(`[kundlista] kunde inte mejla ${r.email}:`, e instanceof Error ? e.message : e);
        await pool.query(`update list_requests set notified_at = null where id = $1`, [r.id]).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[kundlista] kunde inte meddela dem som bett om listan:", e instanceof Error ? e.message : e);
  }
  return result;
}
