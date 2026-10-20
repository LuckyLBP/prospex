"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { diff } from "@/lib/audit-describe";
import { readCollection } from "@/lib/sources/collection";
import { createList, getSourceById, ListError, listSlug, setLogoPath, updateSource } from "@/lib/lists-admin";
import { deleteLogo, UploadError, uploadLogo } from "@/lib/storage";
import { learnFromReview } from "@/lib/agencies/server-guess";

const UUID = /^[0-9a-f-]{36}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const num = (f: FormData, k: string) => { const n = Number(f.get(k)); return Number.isFinite(n) ? Math.trunc(n) : 0; };

function collectionOf(f: FormData) {
  const c = readCollection((k) => String(f.get(k) ?? ""));
  if (!c.ok) throw new ListError(c.error);
  return { method: c.method, config: c.config, enrichSites: c.enrichSites };
}

const sourceInput = (f: FormData) => ({
  name: str(f, "name"),
  description: str(f, "description"),
  kind: str(f, "kind") === "supplier" ? ("supplier" as const) : ("list" as const),
  categoryId: UUID.test(str(f, "category_id")) ? str(f, "category_id") : null,
  published: f.get("published") === "on",
  sort: num(f, "sort"),
  collection: collectionOf(f),
});

const FIELDS = ["name", "description", "kind", "category_id", "sort", "published", "method", "config", "enrich_sites"] as const;

export async function createListAction(f: FormData) {
  const a = await requireAdmin();
  let slug = "";
  try {
    // Allt som kan vara fel kontrolleras innan något sparas: en avvisad logotyp ska inte lämna en halvfärdig lista.
    const input = sourceInput(f);
    slug = listSlug(input.name);
    const file = f.get("logo");
    const logo = file instanceof File && file.size > 0 ? await uploadLogo(slug, file) : null;
    try {
      await createList(input, logo);
    } catch (e) {
      await deleteLogo(logo);
      throw e;
    }
    await audit(a.user, "source.create", "source", { id: slug, name: input.name, details: { kind: "list", published: input.published } });
  } catch (e) {
    if (e instanceof ListError || e instanceof UploadError) redirect(`/admin/listor/ny?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/app", "layout");
  redirect(`/admin/listor/${slug}?ok=${encodeURIComponent("Listan skapades.")}`);
}

/** Sparar en källa (leverantör eller lista) från detaljsidan. Loggar vad som faktiskt ändrades. */
export async function updateSourceAction(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  if (!UUID.test(id)) return;
  const before = await getSourceById(id);
  if (!before) redirect("/admin/listor?error=Källan%20finns%20inte.");
  let after = before;
  try {
    await updateSource(id, sourceInput(f));
    const file = f.get("logo");
    let logo: "changed" | "removed" | null = null;
    if (file instanceof File && file.size > 0) {
      const old = await setLogoPath(id, await uploadLogo(before.slug, file));
      await deleteLogo(old);
      logo = "changed";
    } else if (f.get("remove_logo") === "on" && before.logo_path) {
      await deleteLogo(await setLogoPath(id, null));
      logo = "removed";
    }
    after = (await getSourceById(id)) ?? before;

    const changes = diff(
      { name: before.name, description: before.description, kind: before.kind, category_id: before.category_id, sort: before.sort, published: before.published, method: before.method, config: before.config, enrich_sites: before.enrich_sites },
      { name: after.name, description: after.description, kind: after.kind, category_id: after.category_id, sort: after.sort, published: after.published, method: after.method, config: after.config, enrich_sites: after.enrich_sites },
      [...FIELDS],
    );
    const { published, category_id, ...rest } = changes;
    if (category_id) (rest as Record<string, unknown>).category = category_id;
    if (Object.keys(rest).length) await audit(a.user, "source.update", "source", { id: before.slug, name: after.name, details: { kind: after.kind, changes: rest } });
    if (published) await audit(a.user, after.published ? "source.publish" : "source.unpublish", "source", { id: before.slug, name: after.name, details: { kind: after.kind } });
    // En byrå som hittades via servern och nu publiceras har en admin sagt ja till: servern är byråns, och nästa sajt på den känns igen direkt.
    if (published && after.published && after.method === "agency") await learnFromReview({ supplierId: after.id }, "confirmed");
    if (logo) await audit(a.user, "source.logo", "source", { id: before.slug, name: after.name, details: { kind: after.kind, removed: logo === "removed" } });
  } catch (e) {
    if (e instanceof ListError || e instanceof UploadError) {
      redirect(`${str(f, "return_to") || "/admin/listor"}?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
  revalidatePath("/app", "layout");
  const section = after.kind === "list" ? "listor" : "leverantorer";
  redirect(`/admin/${section}/${after.slug}?ok=${encodeURIComponent("Ändringarna sparades.")}`);
}
