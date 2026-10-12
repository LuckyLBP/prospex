"use client";

import { useEffect, useState } from "react";
import { OUTCOMES, OUTCOME_GROUPS, type CallOutcome } from "@/lib/calls/outcomes";
import { logCallAction } from "@/app/app/actions";

type Props = {
  companyId: string;
  redirectTo: string;
  defaultCallbackDate: string;
  defaultMeeting: string;
  current?: CallOutcome | null;
  submitLabel?: string;
};

const TONES: Record<string, string> = {
  neutral: "border-gray-200 text-gray-800 hover:border-gray-400",
  primary: "border-[#14161F]/30 text-[#14161F] hover:border-[#14161F]",
  success: "border-emerald-300 text-emerald-800 hover:border-emerald-500",
  warning: "border-amber-300 text-amber-800 hover:border-amber-500",
  danger: "border-rose-200 text-rose-800 hover:border-rose-400",
};

export default function CallForm({ companyId, redirectTo, defaultCallbackDate, defaultMeeting, current = null, submitLabel = "Spara och gå vidare" }: Props) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(current);
  const info = OUTCOMES.find((o) => o.value === outcome) ?? null;
  const [archive, setArchive] = useState(false);

  const pick = (o: CallOutcome) => {
    setOutcome(o);
    setArchive(OUTCOMES.find((x) => x.value === o)?.terminal ?? false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const hit = OUTCOMES.find((o) => o.key === e.key);
      if (hit) pick(hit.value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const field = "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-[#F26522]";

  return (
    <form action={logCallAction} className="flex flex-col gap-4">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <input type="hidden" name="outcome" value={outcome ?? ""} />

      {OUTCOME_GROUPS.map((g) => (
        <div key={g.value}>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">{g.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.filter((o) => o.group === g.value).map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => pick(o.value)}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                  outcome === o.value ? "border-[#14161F] bg-[#14161F] text-white" : `bg-white ${TONES[o.tone]}`
                }`}
              >
                {o.label}
                <kbd className={`rounded px-1.5 text-[11px] ${outcome === o.value ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>{o.key}</kbd>
              </button>
            ))}
          </div>
        </div>
      ))}

      {info?.callback && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12px] font-medium text-gray-500">Ring igen (datum)
            <input type="date" name="callback_date" defaultValue={defaultCallbackDate} className={field} />
          </label>
          <label className="text-[12px] font-medium text-gray-500">Klockslag (valfritt)
            <input type="time" name="callback_time" className={field} />
          </label>
        </div>
      )}
      {info?.meeting && (
        <label className="text-[12px] font-medium text-gray-500">Mötets datum och tid
          <input type="datetime-local" name="meeting_at" required defaultValue={defaultMeeting} className={field} />
        </label>
      )}

      <label className="text-[12px] font-medium text-gray-500">Anteckning
        <textarea name="note" rows={3} maxLength={2000} placeholder="Vad sa de? Vem pratade du med?" className={`${field} resize-none`} />
      </label>

      <label className="flex items-center gap-2 text-[13px] text-gray-700">
        <input type="checkbox" name="archive" checked={archive} onChange={(e) => setArchive(e.target.checked)} className="h-4 w-4 accent-[#F26522]" />
        Arkivera företaget (klart, ringa inte igen)
      </label>

      <button disabled={!outcome} className="rounded-full bg-[#F26522] px-6 py-3 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
        {submitLabel}
      </button>
    </form>
  );
}
