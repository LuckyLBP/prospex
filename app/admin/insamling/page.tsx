import { Play } from "@/components/brand/icons";
import PageHeader from "@/components/admin/PageHeader";
import DataTable, { type Column } from "@/components/admin/DataTable";
import RunPoller from "@/components/admin/RunPoller";
import { EmptyState, Flash, StatusPill } from "@/components/admin/bits";
import SupplierLogo from "@/components/ui/SupplierLogo";
import { getCollectionRows, type CollectionRow } from "@/lib/admin-data";
import { methodLabel } from "@/lib/runs/labels";
import { MAX_PER_DAY, MAX_PUBLICWWW_PER_DAY } from "@/lib/runs/schedule";
import { deriveStatus, getTriggerState, progressLabel, STATUS_LABELS } from "@/lib/runs/status";
import { sweepStaleRuns, todaysRuns } from "@/lib/runs/store";
import { formatRelative } from "@/lib/format";
import { runNowAction } from "./actions";

const TONE = { idle: "green", running: "orange", error: "red", never: "gray" } as const;

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await sweepStaleRuns();
  const [all, today] = await Promise.all([getCollectionRows(), todaysRuns()]);
  const rows = all.sort((a, b) => Number(b.late) - Number(a.late) || (a.lastCollect ?? "").localeCompare(b.lastCollect ?? ""));
  const running = rows.filter((r) => deriveStatus(r.run) === "running").length;
  const late = rows.filter((r) => r.late).length;
  const failed = rows.filter((r) => deriveStatus(r.run) === "error").length;

  const cols: Column<CollectionRow>[] = [
    { key: "name", header: "Källa", primary: true, cell: (s) => <span className="flex items-center gap-3"><SupplierLogo name={s.name} logo={s.logo_path} size={24} />{s.name}</span> },
    { key: "method", header: "Metod", cell: (s) => methodLabel(s.method) },
    { key: "n", header: "Företag", align: "right", cell: (s) => s.companies.toLocaleString("sv-SE") },
    { key: "seen", header: "Senast hämtad", cell: (s) => (s.lastCollect ? formatRelative(s.lastCollect) : "Aldrig") },
    { key: "next", header: "Nästa", cell: (s) => s.next },
    { key: "status", header: "Status", cell: (s) => {
      const st = deriveStatus(s.run);
      return (
        <span className="flex flex-col gap-0.5">
          <span className="flex flex-wrap gap-1.5"><StatusPill tone={TONE[st]}>{st === "never" && s.lastCollect ? "Hämtad före Prospex" : STATUS_LABELS[st]}</StatusPill>{s.late && <StatusPill tone="red">Försenad</StatusPill>}</span>
          {st === "running" && s.run && <span className="text-[12px] text-gray-500">{progressLabel(s.run)}</span>}
          {st === "error" && s.run?.error && <span className="max-w-[260px] truncate text-[12px] text-rose-700" title={s.run.error}>{s.run.error}</span>}
        </span>
      );
    } },
    { key: "run", header: "", align: "right", className: "relative z-10", cell: (s) => {
      const t = getTriggerState({ status: deriveStatus(s.run) });
      return (
        <form action={runNowAction}>
          <input type="hidden" name="supplier_id" value={s.id} /><input type="hidden" name="return_to" value="/admin/insamling" />
          <button disabled={t.disabled} title={t.reason ?? "Kör nu"} aria-label={`Kör ${s.name} nu`} className="rounded-full border border-gray-300 p-2 text-gray-600 hover:border-gray-500 hover:text-ink disabled:opacity-30"><Play size={14} /></button>
        </form>
      );
    } },
  ];

  return (
    <>
      <RunPoller active={running > 0} />
      <PageHeader title="Insamling" subtitle="Körningar för alla publicerade källor med en insamlingsmetod" />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { l: "Körs nu", v: running },
          { l: "Försenade", v: late },
          { l: "Senaste körning misslyckades", v: failed },
          { l: `Schemalagda i dag, av ${MAX_PER_DAY} (PublicWWW ${today.publicwww} av ${MAX_PUBLICWWW_PER_DAY})`, v: today.total },
        ].map((k) => (
          <div key={k.l} className="rounded-3xl bg-white p-5"><p className="text-[28px] font-semibold leading-none text-ink">{k.v}</p><p className="mt-2 text-[13px] text-gray-500">{k.l}</p></div>
        ))}
      </div>
      <p className="mb-4 text-[13px] text-gray-500">Varje källa hämtas var 7:e dag, Google Places var 30:e, klockan 04 svensk tid. Öppna en källa för inställningar och körhistorik.</p>
      <DataTable columns={cols} rows={rows} rowKey={(s) => s.id} rowHref={(s) => `/admin/${s.kind === "list" ? "listor" : "leverantorer"}/${s.slug}`} empty={<EmptyState title="Inga publicerade källor med insamling" text="Välj en insamlingsmetod på en källas sida och publicera den." />} />
    </>
  );
}
