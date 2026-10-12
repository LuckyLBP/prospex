import { History } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { EmptyState, StatusPill } from "@/components/admin/bits";
import ProfileSearch from "@/components/admin/profile/ProfileSearch";
import RunPoller from "@/components/admin/RunPoller";
import { requireProfileAccess } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { STAGE_LABEL, orgProfiles, sweepDeadProfiles } from "@/lib/profile/store";
import { createProfileAction, profileProgressAction, searchCompaniesAction } from "./actions";

type Row = Awaited<ReturnType<typeof orgProfiles>>[number];

export default async function TenantProfilesPage() {
  const m = await requireProfileAccess();
  await sweepDeadProfiles();
  const rows = await orgProfiles(m.org.id);
  const running = rows.some((r) => r.status === "queued" || r.status === "running");

  const cols: Column<Row>[] = [
    { key: "name", header: "Företag", primary: true, cell: (r) => r.name ?? r.input },
    { key: "orgnr", header: "Org.nr", cell: (r) => r.orgnr ?? "–" },
    { key: "domain", header: "Webbplats", cell: (r) => r.domain ?? "–" },
    { key: "status", header: "Status", cell: (r) => (r.status === "done" ? <StatusPill tone="green">Klar</StatusPill> : r.status === "error" ? <StatusPill tone="red">Misslyckades</StatusPill> : <StatusPill tone="orange">{r.stage ? STAGE_LABEL[r.stage] : "I kö"}</StatusPill>) },
    { key: "when", header: "Uppdaterad", cell: (r) => formatRelative(r.finished_at ?? r.created_at) },
  ];

  return (
    <>
      <RunPoller active={running} />
      <PageHeader title="Företagsprofil" />
      <ProfileSearch actions={{ create: createProfileAction, progress: profileProgressAction, search: searchCompaniesAction }} basePath="/app/foretagsprofil" />
      <div className="mx-auto w-full max-w-[1100px]">
        <p className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-gray-600"><History size={15} className="text-gray-400" />Dina profiler ({rows.length})</p>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/app/foretagsprofil/${r.id}`} empty={<EmptyState title="Inga profiler än" text="Skriv en webbadress eller ett organisationsnummer ovan för att skapa den första." />} />
      </div>
    </>
  );
}
