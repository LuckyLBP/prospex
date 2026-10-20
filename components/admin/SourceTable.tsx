import DataTable, { type Column } from "./DataTable";
import { StatusPill } from "./bits";
import SupplierLogo from "@/components/ui/SupplierLogo";
import { foundViaServer } from "@/lib/agencies/found-via";
import { methodLabel } from "@/lib/runs/labels";
import { formatDate } from "@/lib/time";
import type { AdminSource } from "@/lib/lists-admin";

const sv = (n: number) => n.toLocaleString("sv-SE");

/** Tabell över leverantörer eller listor. Hela raden öppnar källans egen sida. */
export default function SourceTable({ sources, basePath, withCategory, empty }: { sources: AdminSource[]; basePath: string; withCategory?: boolean; empty: React.ReactNode }) {
  const cols: Column<AdminSource>[] = [
    { key: "name", header: "Namn", primary: true, cell: (s) => <span className="flex items-center gap-3"><SupplierLogo name={s.name} logo={s.logo_path} size={32} />{s.name}</span> },
    ...(withCategory ? [{ key: "cat", header: "Kategori", cell: (s: AdminSource) => s.category_name ?? "–" }] : []),
    { key: "n", header: "Företag", align: "right" as const, cell: (s) => sv(s.companies) },
    { key: "method", header: "Insamling", cell: (s) => methodLabel(s.method) },
    { key: "seen", header: "Senast hämtad", cell: (s) => (s.last_seen ? formatDate(new Date(s.last_seen)) : "Aldrig") },
    { key: "status", header: "Status", cell: (s) => (
      <span className="flex flex-wrap gap-1.5">
        <StatusPill tone={s.published ? "green" : "amber"}>{s.published ? "Publicerad" : "Opublicerad"}</StatusPill>
        {foundViaServer(s.config) && !s.published && <StatusPill tone="orange">Hittad via server</StatusPill>}
        {!s.logo_path && <StatusPill>Saknar logotyp</StatusPill>}
      </span>
    ) },
  ];
  return <DataTable columns={cols} rows={sources} rowKey={(s) => s.id} rowHref={(s) => `${basePath}/${s.slug}`} empty={empty} />;
}
