import PageHeader from "@/components/admin/PageHeader";
import SourceForm from "@/components/admin/SourceForm";
import { Flash } from "@/components/admin/bits";
import { btnPrimary } from "@/components/admin/ui";
import { listCategories } from "@/lib/lists-admin";
import { createListAction } from "../actions";

export default async function NewListPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const categories = await listCategories();
  return (
    <>
      <PageHeader back={{ href: "/admin/listor", label: "Listor" }} title="Ny lista" subtitle="Skapa en lista och lägg den i en kategori"
        actions={<button form="new-list" className={btnPrimary}>Skapa lista</button>} />
      <Flash error={sp.error} />
      <SourceForm formId="new-list" action={createListAction} categories={categories} kind="list" returnTo="/admin/listor/ny" />
    </>
  );
}
