import { notFound } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import CategoryForm from "@/components/admin/CategoryForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { Flash } from "@/components/admin/bits";
import { FormSection } from "@/components/admin/FormSection";
import { btnPrimary } from "@/components/admin/ui";
import { getCategoryAdmin } from "@/lib/lists-admin";
import { deleteCategoryAction, updateCategoryAction } from "../actions";

export default async function CategoryAdminPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = await getCategoryAdmin(slug);
  if (!category) notFound();
  return (
    <>
      <PageHeader back={{ href: "/admin/kategorier", label: "Kategorier" }} title={category.name} subtitle={`${category.lists} ${category.lists === 1 ? "lista" : "listor"} · adress ${category.slug}`}
        actions={<button form="category-form" className={btnPrimary}>Spara</button>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="flex flex-col gap-5">
        <CategoryForm formId="category-form" action={updateCategoryAction} category={category} />
        <FormSection title="Ta bort" description="Går bara när kategorin är tom. Flytta eller ta bort listorna först.">
          {category.lists > 0 ? (
            <p className="text-[14px] text-gray-500">Kategorin har {category.lists} {category.lists === 1 ? "lista" : "listor"} och kan inte tas bort än.</p>
          ) : (
            <form action={deleteCategoryAction}>
              <input type="hidden" name="id" value={category.id} />
              <input type="hidden" name="slug" value={category.slug} />
              <ConfirmButton label="Ta bort kategorin" confirmLabel="Ja, ta bort" message="Ta bort kategorin för gott?" />
            </form>
          )}
        </FormSection>
      </div>
    </>
  );
}
