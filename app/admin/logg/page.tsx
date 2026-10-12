import Link from "next/link";
import PageHeader from "@/components/admin/PageHeader";
import FilterBar from "@/components/admin/FilterBar";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { EmptyState, Pagination } from "@/components/admin/bits";
import { auditActors, listAudit } from "@/lib/audit";
import { AUDIT_GROUPS, describeAudit, type AuditRow } from "@/lib/audit-describe";
import { formatDateTime } from "@/lib/format";

const HREF: Record<string, (r: AuditRow) => string | null> = {
  org: (r) => (r.entity_id ? `/admin/bolag/${r.entity_id}` : null),
  invite: (r) => (r.entity_id ? `/admin/bolag/${r.entity_id}` : null),
  user: (r) => (r.entity_id ? `/admin/anvandare/${r.entity_id}` : null),
  company: (r) => (r.entity_id ? `/admin/foretagsprofil/${r.entity_id}` : null),
  category: (r) => (r.entity_id ? `/admin/kategorier/${r.entity_id}` : null),
  source: (r) => (r.entity_id ? `/admin/${r.details?.kind === "list" ? "listor" : "leverantorer"}/${r.entity_id}` : null),
};

export default async function LogPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string; actor?: string; cursor?: string }> }) {
  const sp = await searchParams;
  const [{ rows, next }, actors] = await Promise.all([listAudit({ group: sp.group, actor: sp.actor, q: sp.q }, { cursor: sp.cursor, limit: 25 }), auditActors()]);
  const cols: Column<AuditRow>[] = [
    { key: "at", header: "Tid", className: "whitespace-nowrap", cell: (r) => <span className="text-gray-500">{formatDateTime(r.at)}</span> },
    { key: "what", header: "Händelse", cell: (r) => { const h = HREF[r.entity]?.(r); const t = describeAudit(r); return h ? <Link href={h} className="text-[#14161F] hover:underline">{t}</Link> : <span>{t}</span>; } },
    { key: "who", header: "Av", className: "whitespace-nowrap", cell: (r) => <span className="text-gray-500">{r.actor_email}</span> },
  ];
  return (
    <>
      <PageHeader title="Aktivitetslogg" subtitle="Vad som gjorts i adminportalen, nyast först. Bara plattformsadmin ser den." />
      <FilterBar basePath="/admin/logg" q={sp.q}
        filters={[
          { key: "group", label: "Typ", value: sp.group, options: AUDIT_GROUPS.map((g) => ({ value: g.value, label: g.label })) },
          ...(actors.length > 1 ? [{ key: "actor", label: "Person", value: sp.actor, options: actors.map((a) => ({ value: a, label: a.split("@")[0] })) }] : []),
        ]} />
      <DataTable columns={cols} rows={rows} rowKey={(r) => String(r.id)} empty={<EmptyState title="Inga händelser" text="Det som görs i adminportalen visas här." />} />
      <Pagination basePath="/admin/logg" params={{ q: sp.q, group: sp.group, actor: sp.actor }} next={next} />
    </>
  );
}
