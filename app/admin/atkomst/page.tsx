import Link from "next/link";
import PageHeader from "@/components/admin/PageHeader";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { EmptyState, StatusPill } from "@/components/admin/bits";
import { LIMITS } from "@/lib/access/limits";
import { accessLevel, accessReport, type AccessRow } from "@/lib/access/report";
import { formatRelative } from "@/lib/format";

export default async function AccessPage() {
  const rows = await accessReport();
  const flagged = rows.filter((r) => accessLevel(r.today) !== "ok").length;

  const cols: Column<AccessRow>[] = [
    { key: "who", header: "Användare", primary: true, cell: (r) => <span className="font-medium text-ink">{r.email}</span> },
    { key: "org", header: "Bolag", cell: (r) => <span className="text-gray-600">{r.org_name ?? "–"}</span> },
    { key: "today", header: "Idag", align: "right", cell: (r) => <span className="font-semibold tabular-nums">{r.today}<span className="font-normal text-gray-400"> / {LIMITS.dailyViews}</span></span> },
    { key: "week", header: "7 dagar", align: "right", cell: (r) => <span className="tabular-nums text-gray-600">{r.week}</span> },
    { key: "peak", header: "Mest på en minut", align: "right", cell: (r) => <span className={`tabular-nums ${r.peak_minute >= LIMITS.minuteViews * 0.8 ? "font-medium text-amber-700" : "text-gray-600"}`}>{r.peak_minute}</span> },
    { key: "search", header: "Sökningar 24 h", align: "right", cell: (r) => <span className="tabular-nums text-gray-600">{r.searches_24h}</span> },
    { key: "level", header: "Status", cell: (r) => { const l = accessLevel(r.today); return l === "reached" ? <StatusPill tone="red">Gräns nådd</StatusPill> : l === "near" ? <StatusPill tone="amber">Nära gränsen</StatusPill> : <StatusPill tone="green">Normal</StatusPill>; } },
    { key: "last", header: "Senast", cell: (r) => <span className="text-gray-500">{r.last_at ? formatRelative(r.last_at) : "–"}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Åtkomst"
        subtitle={`Hur många företag varje användare tagit del av. Gränserna är ${LIMITS.dailyViews} olika företag per dygn och ${LIMITS.minuteViews} per minut. Ett företag räknas en gång per dygn.`}
      />
      {flagged > 0 && (
        <p className="mb-5 rounded-2xl bg-amber-50 px-5 py-3 text-[14px] text-amber-900">
          {flagged} {flagged === 1 ? "användare ligger" : "användare ligger"} nära eller över dygnsgränsen. Öppna användaren för att stänga av kontot om något ser fel ut.
        </p>
      )}
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.user_id} rowHref={(r) => `/admin/anvandare/${r.user_id}`} empty={<EmptyState title="Ingen åtkomst än" text="Det som användarna tar del av visas här." />} />
      <p className="mt-4 text-[12px] text-gray-400">Plattformsadmin räknas inte mot gränserna men loggas. Raderna sparas i 90 dagar. <Link href="/admin/logg" className="underline underline-offset-4">Aktivitetsloggen</Link> visar vad som gjorts i adminportalen.</p>
    </>
  );
}
