"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { AgencyError, ensureAgencySupplier, removeAgencyCustomer, removeAgencyCustomersByConfidence } from "@/lib/agencies/store";
import { getSourceById } from "@/lib/lists-admin";
import { parseProfileInput } from "@/lib/profile/input";
import { failProfile, ProfileStartError, startProfile } from "@/lib/profile/store";
import { triggerProfileBuild } from "@/lib/profile/trigger";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/i;

/** Skapar en byrå som källa för hand: opublicerad, med metoden Byrå. Finns domänen redan öppnas den befintliga. */
export async function createAgencyAction(f: FormData) {
  const a = await requireAdmin();
  let slug: string;
  try {
    const agency = await ensureAgencySupplier({ name: str(f, "name"), domain: str(f, "domain") });
    slug = agency.slug;
    if (agency.created) await audit(a.user, "source.create", "source", { id: agency.slug, name: agency.name, details: { kind: "supplier", method: "agency", domain: agency.domain } });
  } catch (e) {
    if (e instanceof AgencyError) redirect(`/admin/leverantorer?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/admin/leverantorer");
  redirect(`/admin/leverantorer/${slug}?ok=${encodeURIComponent("Byrån skapades. Den är opublicerad tills du har granskat kunderna.")}`);
}

/** Tar bort en kund från en byrå. Domänen minns, så att nästa körning inte lägger tillbaka den. */
export async function removeAgencyCustomerAction(f: FormData) {
  const a = await requireAdmin();
  const supplierId = str(f, "supplier_id");
  const companyId = str(f, "company_id");
  if (!UUID.test(supplierId) || !UUID.test(companyId)) return;
  const source = await getSourceById(supplierId);
  if (!source) redirect("/admin/leverantorer?error=Källan%20finns%20inte.");
  const removed = await removeAgencyCustomer(supplierId, companyId);
  if (removed) await audit(a.user, "source.update", "source", { id: source.slug, name: source.name, details: { kind: "supplier", changes: { customer_removed: companyId } } });
  revalidatePath("/app", "layout");
  redirect(`/admin/leverantorer/${source.slug}?ok=${encodeURIComponent(removed ? "Kunden togs bort och läggs inte tillbaka." : "Kunden fanns inte längre.")}`);
}

/** Bygger en företagsprofil av byrån själv (skriven av Claude när det finns en nyckel) och öppnar den. */
export async function profileAgencyAction(f: FormData) {
  const a = await requireAdmin();
  const supplierId = str(f, "supplier_id");
  if (!UUID.test(supplierId)) return;
  const source = await getSourceById(supplierId);
  if (!source || source.method !== "agency") redirect("/admin/leverantorer?error=Källan%20är%20ingen%20byrå.");
  const parsed = parseProfileInput(String((source.config as { domain?: string } | null)?.domain ?? ""));
  if (parsed.kind !== "url") redirect(`/admin/leverantorer/${source.slug}?error=${encodeURIComponent("Byråns domän är ogiltig.")}`);

  let id: string;
  try {
    const started = await startProfile(parsed, { id: a.user.id });
    id = started.id;
    if (!started.reused) {
      try {
        await triggerProfileBuild(id, { orgnr: null });
      } catch (e) {
        await failProfile(id, `Kunde inte starta bygget: ${e instanceof Error ? e.message : "okänt fel"}`);
      }
      await audit(a.user, "profile.create", "company", { id, name: parsed.domain, details: { input: parsed.domain, kind: "url", agency: source.slug } });
    }
  } catch (e) {
    if (e instanceof ProfileStartError) redirect(`/admin/leverantorer/${source.slug}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/admin/foretagsprofil/${id}`);
}

const TIERS = ["credit", "text-credit", "footer-link", "fingerprint", "portfolio", "backlink"];

/** Tar bort alla kunder med en viss bevisnivå, till exempel alla som bara har en bakåtlänk. Domänerna läggs inte tillbaka. */
export async function removeCustomersByTierAction(f: FormData) {
  const a = await requireAdmin();
  const supplierId = str(f, "supplier_id");
  const tier = str(f, "tier");
  if (!UUID.test(supplierId) || !TIERS.includes(tier)) return;
  const source = await getSourceById(supplierId);
  if (!source) redirect("/admin/leverantorer?error=Källan%20finns%20inte.");
  const n = await removeAgencyCustomersByConfidence(supplierId, tier);
  if (n > 0) await audit(a.user, "source.update", "source", { id: source.slug, name: source.name, details: { kind: "supplier", changes: { customers_removed: n, tier } } });
  revalidatePath("/app", "layout");
  redirect(`/admin/leverantorer/${source.slug}?ok=${encodeURIComponent(`${n} kunder togs bort och läggs inte tillbaka.`)}`);
}
