import PageHeader from "@/components/admin/PageHeader";
import FilterBar from "@/components/admin/FilterBar";
import SourceTable from "@/components/admin/SourceTable";
import { EmptyState, Flash } from "@/components/admin/bits";
import { Input } from "@/components/admin/FormSection";
import { btnPrimary } from "@/components/admin/ui";
import { listSources } from "@/lib/lists-admin";
import { createAgencyAction } from "./actions";

export default async function SuppliersAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const all = (await listSources()).filter((s) => s.kind === "supplier");
  const q = sp.q?.trim().toLowerCase();
  const rows = all
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.slug.includes(q))
    .filter((s) => !sp.status || (sp.status === "publicerad" ? s.published : sp.status === "opublicerad" ? !s.published : sp.status === "saknar-logotyp" ? !s.logo_path : true));

  return (
    <>
      <PageHeader title="Leverantörer" subtitle="Företag vars kunder vi hittar: byråer, kataloger och webbhotell" />
      <Flash ok={sp.ok} error={sp.error} />
      <FilterBar basePath="/admin/leverantorer" q={sp.q} total={rows.length} noun={rows.length === 1 ? "leverantör" : "leverantörer"}
        filters={[{ key: "status", label: "Status", value: sp.status, options: [{ value: "publicerad", label: "Publicerade" }, { value: "opublicerad", label: "Opublicerade" }, { value: "saknar-logotyp", label: "Saknar logotyp" }] }]} />
      <form action={createAgencyAction} className="mb-5 flex flex-wrap items-end gap-3 rounded-3xl bg-white p-5">
        <div className="min-w-[200px] flex-1"><label className="text-[12px] font-medium text-gray-600">Ny byrå<Input name="name" required placeholder="Byråns namn, till exempel Conseo" className="mt-1" /></label></div>
        <div className="min-w-[200px] flex-1"><label className="text-[12px] font-medium text-gray-600">Domän<Input name="domain" required placeholder="conseo.se" className="mt-1" /></label></div>
        <button className={btnPrimary}>Skapa byrå</button>
      </form>
      <SourceTable sources={rows} basePath="/admin/leverantorer" empty={<EmptyState title="Inga leverantörer matchar" text="Ändra sökningen eller filtret." />} />
    </>
  );
}
