import Link from "next/link";
import { Plus } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import FilterBar from "@/components/admin/FilterBar";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { EmptyState, Flash, StatusPill } from "@/components/admin/bits";
import { btnPrimary } from "@/components/admin/ui";
import { listOrganizations } from "@/lib/orgs";

type Row = Awaited<ReturnType<typeof listOrganizations>>[number];

export default async function OrgsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const rows = (await listOrganizations())
    .filter((o) => !q || o.name.toLowerCase().includes(q) || (o.owners ?? "").toLowerCase().includes(q))
    .filter((o) => !sp.status || (sp.status === "aktiva" ? o.active : sp.status === "avstangda" ? !o.active : sp.status === "utan-agare" ? !o.owners : true));

  const cols: Column<Row>[] = [
    { key: "name", header: "Bolag", primary: true, cell: (o) => o.name },
    { key: "owners", header: "Ägare", cell: (o) => <span className="block max-w-[260px] truncate text-gray-600">{o.owners ?? <span className="text-amber-700">Saknas</span>}</span> },
    { key: "members", header: "Medlemmar", align: "right", cell: (o) => <>{o.members}{o.pending > 0 && <span className="ml-1.5 text-[12px] text-amber-700">+{o.pending} inbjudna</span>}</> },
    { key: "calls", header: "Samtal 30 d", align: "right", cell: (o) => o.calls_30d.toLocaleString("sv-SE") },
    { key: "status", header: "Status", cell: (o) => <StatusPill tone={o.active ? "green" : "gray"}>{o.active ? "Aktiv" : "Avstängd"}</StatusPill> },
  ];
  return (
    <>
      <PageHeader title="Bolag" subtitle="Kundbolagen på plattformen" actions={<Link href="/admin/bolag/ny" className={btnPrimary}><Plus size={15} />Nytt bolag</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <FilterBar basePath="/admin/bolag" q={sp.q} total={rows.length} noun={rows.length === 1 ? "bolag" : "bolag"}
        filters={[{ key: "status", label: "Status", value: sp.status, options: [{ value: "aktiva", label: "Aktiva" }, { value: "avstangda", label: "Avstängda" }, { value: "utan-agare", label: "Utan ägare" }] }]} />
      <DataTable columns={cols} rows={rows} rowKey={(o) => o.id} rowHref={(o) => `/admin/bolag/${o.slug}`} empty={<EmptyState title="Inga bolag matchar" text="Ändra sökningen eller skapa ett nytt bolag." action={{ href: "/admin/bolag/ny", label: "Nytt bolag" }} />} />
    </>
  );
}
