import { ChevronDown, History } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { EmptyState, Flash, StatusPill } from "@/components/admin/bits";
import ProfileSearch from "@/components/admin/profile/ProfileSearch";
import RunPoller from "@/components/admin/RunPoller";
import { isBolagsverketConfigured, isBolagsverketTest } from "@/lib/bolagsverket/client";
import { isAiConfigured } from "@/lib/ai/model";
import { pool } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { isPlacesConfigured } from "@/lib/profile/places";
import { STAGE_LABEL, recentProfiles, sweepDeadProfiles } from "@/lib/profile/store";

type Row = Awaited<ReturnType<typeof recentProfiles>>[number];

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  await sweepDeadProfiles();
  const rows = await recentProfiles(50);
  const ids = [...new Set(rows.map((r) => r.requested_by).filter((x): x is string => !!x))];
  const people = ids.length ? new Map((await pool.query(`select user_id, email from profiles where user_id = any($1)`, [ids])).rows.map((r) => [r.user_id as string, r.email as string])) : new Map<string, string>();
  const running = rows.some((r) => r.status === "queued" || r.status === "running");

  const notices = [
    !isBolagsverketConfigured() && "Bolagsverket är inte konfigurerat. Profilen byggs utan registeruppgifter.",
    isBolagsverketConfigured() && isBolagsverketTest() && "Bolagsverket är i testläge och känner inte igen riktiga organisationsnummer.",
    !isAiConfigured() && "AI är inte konfigurerat. Profilen byggs utan sammanfattning.",
    !isPlacesConfigured() && "Google Places är inte konfigurerat. En webbplats går inte att leta upp utifrån ett organisationsnummer.",
  ].filter((x): x is string => !!x);

  const cols: Column<Row>[] = [
    { key: "name", header: "Företag", primary: true, cell: (r) => r.name ?? r.input },
    { key: "orgnr", header: "Org.nr", cell: (r) => r.orgnr ?? "–" },
    { key: "domain", header: "Webbplats", cell: (r) => r.domain ?? "–" },
    { key: "status", header: "Status", cell: (r) => (r.status === "done" ? <StatusPill tone="green">Klar</StatusPill> : r.status === "error" ? <StatusPill tone="red">Misslyckades</StatusPill> : <StatusPill tone="orange">{r.stage ? STAGE_LABEL[r.stage] : "I kö"}</StatusPill>) },
    { key: "when", header: "Uppdaterad", cell: (r) => formatRelative(r.finished_at ?? r.created_at) },
    { key: "by", header: "Av", cell: (r) => <span className="text-gray-500">{r.requested_by ? (people.get(r.requested_by) ?? "").split("@")[0] || "–" : "–"}</span> },
  ];

  return (
    <>
      <RunPoller active={running} />
      <PageHeader title="Företagsprofil" />
      <ProfileSearch />
      <Flash ok={sp.ok} error={sp.error} />
      {notices.length > 0 && <ul className="mx-auto mb-8 max-w-[720px] text-center text-[12px] text-amber-700">{notices.map((n) => <li key={n} className="py-0.5">{n}</li>)}</ul>}

      <details open={running || undefined} className="group mx-auto w-full max-w-[1100px]">
        <summary className="mx-auto mb-4 flex w-fit cursor-pointer list-none items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:text-[#14161F] [&::-webkit-details-marker]:hidden">
          <History size={15} className="text-gray-400" />
          Tidigare profiler ({rows.length})
          {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F26522]" aria-label="Pågår" />}
          <ChevronDown size={15} className="text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/admin/foretagsprofil/${r.id}`} empty={<EmptyState title="Inga profiler än" text="Skriv en webbadress eller ett organisationsnummer ovan för att skapa den första." />} />
      </details>
    </>
  );
}
