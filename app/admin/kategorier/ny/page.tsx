import PageHeader from "@/components/admin/PageHeader";
import CategoryForm from "@/components/admin/CategoryForm";
import { Flash } from "@/components/admin/bits";
import { btnPrimary } from "@/components/admin/ui";
import { createCategoryAction } from "../actions";

export default async function NewCategoryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader back={{ href: "/admin/kategorier", label: "Kategorier" }} title="Ny kategori" actions={<button form="new-category" className={btnPrimary}>Skapa kategori</button>} />
      <Flash error={sp.error} />
      <CategoryForm formId="new-category" action={createCategoryAction} />
    </>
  );
}
