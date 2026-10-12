import { Plus } from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/admin/PageHeader";
import FilterBar from "@/components/admin/FilterBar";
import SourceTable from "@/components/admin/SourceTable";
import { EmptyState, Flash } from "@/components/admin/bits";
import { btnPrimary } from "@/components/admin/ui";
import { listSources } from "@/lib/lists-admin";

export default async function ListsAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const all = (await listSources()).filter((s) => s.kind === "list");
  const q = sp.q?.trim().toLowerCase();
  const rows = all
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.slug.includes(q))
    .filter((s) => !sp.status || (sp.status === "publicerad" ? s.published : sp.status === "opublicerad" ? !s.published : sp.status === "tom" ? s.companies === 0 : true))
    .sort((a, b) => (a.category_name ?? "").localeCompare(b.category_name ?? "", "sv") || a.sort - b.sort || a.name.localeCompare(b.name, "sv"));

  return (
    <>
      <PageHeader title="Listor" subtitle="Företag i en bransch eller på en plattform, utan koppling till en leverantör"
        actions={<Link href="/admin/listor/ny" className={btnPrimary}><Plus size={15} />Ny lista</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <FilterBar basePath="/admin/listor" q={sp.q} total={rows.length} noun={rows.length === 1 ? "lista" : "listor"}
        filters={[{ key: "status", label: "Status", value: sp.status, options: [{ value: "publicerad", label: "Publicerade" }, { value: "opublicerad", label: "Opublicerade" }, { value: "tom", label: "Utan företag" }] }]} />
      <SourceTable sources={rows} basePath="/admin/listor" withCategory empty={<EmptyState title="Inga listor matchar" text="Ändra sökningen eller filtret, eller skapa en ny lista." action={{ href: "/admin/listor/ny", label: "Ny lista" }} />} />
    </>
  );
}
