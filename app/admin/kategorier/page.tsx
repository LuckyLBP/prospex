import Link from "next/link";
import { Plus } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { EmptyState, Flash, StatusPill } from "@/components/admin/bits";
import { btnPrimary } from "@/components/admin/ui";
import CategoryIcon from "@/components/ui/CategoryIcon";
import { listCategories } from "@/lib/lists-admin";

type Row = Awaited<ReturnType<typeof listCategories>>[number];

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const rows = await listCategories();
  const cols: Column<Row>[] = [
    { key: "name", header: "Namn", primary: true, cell: (c) => <span className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#14161F] text-white"><CategoryIcon icon={c.icon} size={16} /></span>{c.name}</span> },
    { key: "desc", header: "Beskrivning", cell: (c) => <span className="text-gray-500">{c.description ?? "–"}</span> },
    { key: "lists", header: "Listor", align: "right", cell: (c) => c.lists },
    { key: "brand", header: "Texter", cell: (c) => (c.names_brand ? <StatusPill tone="orange">Namnger varumärken</StatusPill> : <span className="text-gray-400">Vanliga</span>) },
  ];
  return (
    <>
      <PageHeader title="Kategorier" subtitle="Rubrikerna som listorna grupperas under" actions={<Link href="/admin/kategorier/ny" className={btnPrimary}><Plus size={15} />Ny kategori</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <DataTable columns={cols} rows={rows} rowKey={(c) => c.id} rowHref={(c) => `/admin/kategorier/${c.slug}`} empty={<EmptyState title="Inga kategorier än" action={{ href: "/admin/kategorier/ny", label: "Ny kategori" }} />} />
    </>
  );
}
