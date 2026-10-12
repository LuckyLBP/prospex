import { Play, RotateCw, Square } from "lucide-react";
import RunPoller from "./RunPoller";
import { StatusPill } from "./bits";
import { btnPrimary, btnSecondary } from "./ui";
import { cancelRunAction, requeueAction, runNowAction } from "@/app/admin/insamling/actions";
import { failedEnrichmentCount, runHistory, type RunRow } from "@/lib/runs/store";
import { deriveStatus, getTriggerState, progressLabel, STATUS_LABELS } from "@/lib/runs/status";
import { formatDateTime, formatDuration } from "@/lib/format";
import { describeNextRefresh } from "@/lib/runs/schedule";

const TONE = { idle: "green", running: "orange", error: "red", never: "gray" } as const;

/** Körningskortet på en källas sida: status, Kör nu, Avbryt, läs om misslyckade och de senaste körningarna. */
export default async function RunPanel({ source, returnTo, lastSeen }: { source: { id: string; method: string | null; published: boolean }; returnTo: string; lastSeen: string | null }) {
  const [runs, failed] = await Promise.all([runHistory(source.id, 20), failedEnrichmentCount(source.id)]);
  const latest = runs[0] ?? null;
  const status = deriveStatus(latest);
  const trigger = getTriggerState({ status });
  const noMethod = !source.method;
  const next = source.published && source.method ? describeNextRefresh(latest?.started_at ?? lastSeen, new Date(), source.method) : null;
  const hidden = (<><input type="hidden" name="supplier_id" value={source.id} /><input type="hidden" name="return_to" value={returnTo} /></>);

  return (
    <section className="mb-5 rounded-3xl bg-white p-6">
      <RunPoller active={status === "running"} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[16px] font-semibold text-ink">Körningar</h2>
            <StatusPill tone={TONE[status]}>{status === "never" && lastSeen ? "Hämtad före Prospex" : STATUS_LABELS[status]}</StatusPill>
            {next?.late && <StatusPill tone="red">Försenad</StatusPill>}
          </div>
          <p className="mt-1 text-[13px] text-gray-500">
            {status === "running" && latest ? progressLabel(latest)
              : noMethod ? "Välj en insamlingsmetod nedan för att kunna köra."
              : !source.published ? "Opublicerad: körs bara när du startar den."
              : next ? `Nästa automatiska hämtning ${next.label}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {failed > 0 && status !== "running" && !noMethod && (
            <form action={requeueAction}>{hidden}<button className={btnSecondary}><RotateCw size={14} />Läs om misslyckade ({failed})</button></form>
          )}
          {status === "running" && latest && (
            <form action={cancelRunAction}><input type="hidden" name="run_id" value={latest.id} /><input type="hidden" name="return_to" value={returnTo} /><button className={btnSecondary}><Square size={13} />Avbryt</button></form>
          )}
          <form action={runNowAction}>{hidden}
            <button disabled={trigger.disabled || noMethod} title={noMethod ? "Ingen metod vald" : (trigger.reason ?? undefined)} className={btnPrimary}><Play size={14} />Kör nu</button>
          </form>
        </div>
      </div>

      {runs.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead><tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
              {["Start", "Status", "Tid", "Hittade", "Nya", "Berikade", "Fel"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>{runs.map((r) => <RunLine key={r.id} r={r} />)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RunLine({ r }: { r: RunRow }) {
  const s = deriveStatus(r);
  return (
    <tr className="border-b border-gray-50 last:border-0 align-top">
      <td className="py-2 pr-4 whitespace-nowrap text-gray-700">{formatDateTime(r.started_at ?? r.created_at)}{r.triggered_by === null && <span className="ml-1.5 text-gray-400">schema</span>}</td>
      <td className="py-2 pr-4"><StatusPill tone={TONE[s]}>{STATUS_LABELS[s]}</StatusPill></td>
      <td className="py-2 pr-4 whitespace-nowrap text-gray-600">{formatDuration(r.started_at, r.finished_at)}</td>
      <td className="py-2 pr-4 text-gray-600">{r.records_found.toLocaleString("sv-SE")}{r.truncated && <span title="Källan kapade resultatet"> *</span>}</td>
      <td className="py-2 pr-4 text-gray-600">{r.records_new.toLocaleString("sv-SE")}</td>
      <td className="py-2 pr-4 text-gray-600">{r.enrich_total > 0 ? `${r.enriched_count} av ${r.enrich_total}` : "–"}</td>
      <td className="py-2">{r.error ? <span className="text-rose-700">{r.error}</span> : r.note ? <span className="text-amber-700">{r.note}</span> : r.enrich_failed > 0 ? <span className="text-rose-700">{`${r.enrich_failed} webbplatser svarade inte`}</span> : ""}</td>
    </tr>
  );
}
