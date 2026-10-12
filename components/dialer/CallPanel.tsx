"use client";

import type { RefObject } from "react";
import { ChevronLeft, SkipForward } from "lucide-react";
import { OUTCOMES, OUTCOME_GROUPS, type CallOutcome } from "@/lib/calls/outcomes";
import { quickCallbackDates } from "@/lib/dialer/quickdates";

export type CallFormState = {
  outcome: CallOutcome | null;
  /** Anteckningen skrivs i chatten, så den är inte en del av utfallsformuläret. */
  cbDate: string;
  cbTime: string;
  meeting: string;
  archive: boolean;
};

type Props = {
  form: CallFormState;
  onChange: (patch: Partial<CallFormState>) => void;
  onPick: (o: CallOutcome) => void;
  canSave: boolean;
  /** Varför det inte går att spara än, i klartext. */
  reason: string | null;
  onSubmit: () => void;
  onSkip: () => void;
  onBack: () => void;
  canBack: boolean;
  meetingRef: RefObject<HTMLInputElement>;
  /** Ruta ovanför spara-knappen (sparat/ångra, fel). */
  status?: React.ReactNode;
};

const TONES: Record<string, string> = {
  neutral: "border-gray-200 text-gray-800 hover:border-gray-400",
  primary: "border-[#14161F]/30 text-[#14161F] hover:border-[#14161F]",
  success: "border-emerald-300 text-emerald-800 hover:border-emerald-500",
  warning: "border-amber-300 text-amber-800 hover:border-amber-500",
  danger: "border-rose-200 text-rose-800 hover:border-rose-400",
};

const FIELD = "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-[#F26522] focus-visible:ring-2 focus-visible:ring-[#F26522]/20";

function Kbd({ children, on }: { children: React.ReactNode; on?: boolean }) {
  return <kbd className={`rounded px-1.5 text-[11px] font-medium ${on ? "bg-white/20" : "bg-black/[0.06] text-gray-500"}`}>{children}</kbd>;
}

export default function CallPanel({ form, onChange, onPick, canSave, reason, onSubmit, onSkip, onBack, canBack, meetingRef, status }: Props) {
  const info = OUTCOMES.find((o) => o.value === form.outcome) ?? null;
  const quick = quickCallbackDates();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h3 className="mb-3 text-[16px] font-semibold text-[#14161F]">Hur gick samtalet?</h3>

      <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pr-2">
      <div className="flex flex-col gap-2.5">
        {OUTCOME_GROUPS.map((g) => (
          <div key={g.value}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">{g.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.filter((o) => o.group === g.value).map((o) => {
                const on = form.outcome === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    // Knappen ska inte ta fokus, annars blir Enter "klicka igen" i stället för "spara".
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPick(o.value)}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F26522] ${
                      on ? "border-[#14161F] bg-[#14161F] text-white" : `bg-white ${TONES[o.tone]}`
                    }`}
                  >
                    <span className="leading-tight">{o.label}</span>
                    <Kbd on={on}>{o.key}</Kbd>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {info?.callback && (
        <div className="dialer-in rounded-2xl bg-[#F4F4F1] p-3.5">
          <p className="mb-2 text-[12px] font-medium text-gray-600">Ring igen (valfritt)</p>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange({ cbDate: form.cbDate === q.date ? "" : q.date })}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${form.cbDate === q.date ? "bg-[#14161F] text-white" : "bg-white text-gray-800 hover:bg-gray-50"}`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-gray-500">Datum<input type="date" value={form.cbDate} onChange={(e) => onChange({ cbDate: e.target.value })} className={FIELD} /></label>
            <label className="text-[11px] font-medium text-gray-500">Klockslag<input type="time" value={form.cbTime} disabled={!form.cbDate} onChange={(e) => onChange({ cbTime: e.target.value })} className={`${FIELD} disabled:opacity-40`} /></label>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-gray-500">{form.cbDate ? "Företaget blir ditt att ringa upp den dagen." : "Utan datum går företaget tillbaka till den gemensamma kön imorgon."}</p>
        </div>
      )}

      {info?.meeting && (
        <label className="dialer-in block rounded-2xl bg-[#F4F4F1] p-3.5 text-[12px] font-medium text-gray-600">
          Mötets datum och tid
          <input ref={meetingRef} type="datetime-local" required value={form.meeting} onChange={(e) => onChange({ meeting: e.target.value })} className={FIELD} />
        </label>
      )}

      {info?.terminal && (
        <label className="dialer-in flex items-center gap-2 text-[13px] text-gray-700">
          <input type="checkbox" checked={form.archive} onChange={(e) => onChange({ archive: e.target.checked })} className="h-4 w-4 accent-[#F26522]" />
          Arkivera företaget (klart, ringa inte igen)
        </label>
      )}

      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-gray-100 pt-3">
        {status}
        <button
          type="button"
          disabled={!canSave}
          onClick={onSubmit}
          title="Enter sparar. ⌘ Enter sparar även från anteckningen."
          className="flex items-center justify-center gap-2 rounded-full bg-[#F26522] px-6 py-3 text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          {canSave ? <>Spara och nästa <Kbd on>⏎</Kbd></> : reason}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} disabled={!canBack} onMouseDown={(e) => e.preventDefault()} className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium hover:border-gray-500 disabled:opacity-40">
            <ChevronLeft size={15} /> Förra <Kbd>←</Kbd>
          </button>
          <button type="button" onClick={onSkip} onMouseDown={(e) => e.preventDefault()} className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium hover:border-gray-500">
            <SkipForward size={15} /> Hoppa över <Kbd>S</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
