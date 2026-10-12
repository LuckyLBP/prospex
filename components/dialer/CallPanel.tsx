"use client";

import type { RefObject } from "react";
import { X } from "lucide-react";
import { OUTCOMES, type CallOutcome } from "@/lib/calls/outcomes";
import { quickCallbackDates } from "@/lib/dialer/quickdates";
import type { CallFormState } from "@/lib/dialer/outcome-form";

export type { CallFormState };

type Props = {
  form: CallFormState;
  onChange: (patch: Partial<CallFormState>) => void;
  /** Ta bort det valda utfallet. */
  onClear: () => void;
  /** Öppna menyn för att byta utfall. */
  onChangeOutcome: () => void;
  meetingRef: RefObject<HTMLInputElement>;
};

const FIELD = "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/20";

/**
 * Samtalsstatusen på sidan: vilket utfall som är valt och det som hör till det (ring igen, mötestid, arkivera).
 * Utfallen väljs i menyn bakom "Logga samtal" i nedre fältet. Utan val visas ingenting.
 */
export default function CallPanel({ form, onChange, onClear, onChangeOutcome, meetingRef }: Props) {
  const info = OUTCOMES.find((o) => o.value === form.outcome) ?? null;
  const quick = quickCallbackDates();
  if (!info) return null;

  return (
    <section className="dialer-in flex flex-col gap-3 rounded-2xl bg-canvas p-4" aria-label="Samtalsstatus">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-gray-500">Så här gick samtalet</p>
          <p className="truncate text-[16px] font-semibold text-ink">{info.label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onChangeOutcome} className="rounded-full px-3 py-2 text-[13px] font-medium text-accent-text hover:bg-white">Ändra</button>
          <button type="button" onClick={onClear} aria-label="Ta bort valet" className="rounded-full p-2 text-gray-500 hover:bg-white"><X size={16} /></button>
        </div>
      </div>

      {info.callback && (
        <div className="rounded-2xl bg-white p-3.5">
          <p className="mb-2 text-[12px] font-medium text-gray-600">Ring igen (valfritt)</p>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange({ cbDate: form.cbDate === q.date ? "" : q.date })}
                className={`rounded-full px-3 py-2 text-[13px] font-medium ${form.cbDate === q.date ? "bg-ink text-white" : "bg-canvas text-gray-800 hover:bg-gray-200"}`}
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

      {info.meeting && (
        <label className="block rounded-2xl bg-white p-3.5 text-[12px] font-medium text-gray-600">
          Mötets datum och tid
          <input ref={meetingRef} type="datetime-local" required value={form.meeting} onChange={(e) => onChange({ meeting: e.target.value })} className={FIELD} />
        </label>
      )}

      {info.terminal && (
        <label className="flex items-center gap-2 text-[13px] text-gray-700">
          <input type="checkbox" checked={form.archive} onChange={(e) => onChange({ archive: e.target.checked })} className="h-4 w-4 accent-accent" />
          Arkivera företaget (klart, ringa inte igen)
        </label>
      )}
    </section>
  );
}
