"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { diff } from "@/lib/audit-describe";
import { createCategory, deleteCategory, getCategoryAdmin, ListError, updateCategory } from "@/lib/lists-admin";

const UUID = /^[0-9a-f-]{36}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const input = (f: FormData) => ({ name: str(f, "name"), description: str(f, "description"), icon: str(f, "icon"), namesBrand: f.get("names_brand") === "on", sort: Number(f.get("sort")) || 0 });

export async function createCategoryAction(f: FormData) {
  const a = await requireAdmin();
  let slug = "";
  try {
    const i = input(f);
    slug = await createCategory(i);
    await audit(a.user, "category.create", "category", { id: slug, name: i.name.trim() });
  } catch (e) {
    if (e instanceof ListError) redirect(`/admin/kategorier/ny?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/app", "layout");
  redirect(`/admin/kategorier/${slug}?ok=${encodeURIComponent("Kategorin skapades.")}`);
}

export async function updateCategoryAction(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  const back = str(f, "slug");
  if (!UUID.test(id)) return;
  try {
    const before = await getCategoryAdmin(back);
    const i = input(f);
    await updateCategory(id, i);
    const after = await getCategoryAdmin(back);
    if (before && after) {
      const changes = diff({ name: before.name, description: before.description, icon: before.icon, names_brand: before.names_brand, sort: before.sort }, { name: after.name, description: after.description, icon: after.icon, names_brand: after.names_brand, sort: after.sort }, ["name", "description", "icon", "names_brand", "sort"]);
      if (Object.keys(changes).length) await audit(a.user, "category.update", "category", { id: back, name: after.name, details: { changes } });
    }
  } catch (e) {
    if (e instanceof ListError) redirect(`/admin/kategorier/${back}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/app", "layout");
  redirect(`/admin/kategorier/${back}?ok=${encodeURIComponent("Ändringarna sparades.")}`);
}

export async function deleteCategoryAction(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  const slug = str(f, "slug");
  if (!UUID.test(id)) return;
  try {
    const before = await getCategoryAdmin(slug);
    await deleteCategory(id);
    await audit(a.user, "category.delete", "category", { id: slug, name: before?.name ?? slug });
  } catch (e) {
    if (e instanceof ListError) redirect(`/admin/kategorier/${slug}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/app", "layout");
  redirect(`/admin/kategorier?ok=${encodeURIComponent("Kategorin togs bort.")}`);
}
