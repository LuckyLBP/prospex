"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEMPLATES, dialerHref, sameScope, type DialerScope, type QueueTemplate } from "@/lib/dialer/scope";
import { QUEUE_ORDERS, type QueueOrder } from "@/lib/dialer/order";
import { queueOrderAction } from "@/app/app/actions";
import SourcePicker from "./SourcePicker";
import Sheet from "./Sheet";
import type { DialerInit } from "./types";

const FIELD = "h-11 w-full rounded-full border border-gray-200 bg-white px-4 text-[14px] outline-none transition-colors hover:border-gray-300 focus:border-accent placeholder:text-gray-400";

/**
 * Mall, källa, ort och ordning på kön. Ändringarna är ett utkast: inget händer förrän man trycker Använd, och då byggs
 * en enda ny lista av allt på en gång. Avbryt (eller Esc) lämnar listan som den var.
 */
export default function FilterSheet({ init, onClose, onReplace }: { init: DialerInit; onClose: () => void; /** Kör ett byte av lista, efter en fråga om man är mitt i en lista. */ onReplace: (go: () => void) => void }) {
  const router = useRouter();
  const { scope } = init;
  const [mode, setMode] = useState(scope.mode);
  const [template, setTemplate] = useState<QueueTemplate | undefined>(scope.template);
  const [sources, setSources] = useState<string[]>(scope.sources);
  const [city, setCity] = useState(scope.city ?? "");
  const [order, setOrder] = useState<QueueOrder>(init.order);

  const next: DialerScope = { ...scope, mode, template: mode === "new" ? template : undefined, sources, city: city.trim() || undefined };
  const orderChanged = mode === "new" && order !== init.order;
  const changed = !sameScope(next, scope) || orderChanged;
  const hasFilters = sources.length > 0 || !!city.trim() || !!template;

  function apply() {
    if (!changed) { onClose(); return; }
    const href = dialerHref(next, [], { ny: true });
    onReplace(() => {
      onClose();
      if (orderChanged) { const fd = new FormData(); fd.set("order", order); fd.set("redirect_to", href); void queueOrderAction(fd); }
      else router.push(href);
    });
  }

  return (
    <Sheet title="Filter" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="flex min-h-0 flex-1 flex-col">
        {/* Fälten rullar när telefonen är liten; Använd och Avbryt ligger kvar längst ned. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-gray-500">Mallar</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mallar">
            {TEMPLATES.map((t) => {
              const on = mode === "new" && (template ?? null) === t.value;
              return (
                <button key={t.label} type="button" role="radio" aria-checked={on} title={t.hint} onClick={() => { setMode("new"); setTemplate(t.value ?? undefined); }}
                  className={`h-11 rounded-full border px-4 text-[14px] font-medium transition-colors ${on ? "border-ink bg-ink text-white" : "border-gray-200 bg-white text-ink hover:border-gray-400"}`}>
                  {t.label}
                </button>
              );
            })}
          </div>
          {mode === "new" && <p className="mt-1.5 text-[12px] text-gray-500">{TEMPLATES.find((t) => (template ?? null) === t.value)?.hint}.</p>}
        </div>

        <SourcePicker suppliers={init.suppliers} value={sources} onChange={setSources} />

        <label className="block text-[12px] font-medium text-gray-500">Ort
          <input aria-label="Ort" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Till exempel Malmö" className={`mt-1 ${FIELD}`} />
        </label>

        {mode === "new" && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-gray-500">Ordning</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ordning">
              {QUEUE_ORDERS.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={order === o.value} onClick={() => setOrder(o.value)}
                  className={`h-10 rounded-full border px-4 text-[14px] font-medium transition-colors ${order === o.value ? "border-ink bg-ink text-white" : "border-gray-200 bg-white text-ink hover:border-gray-400"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasFilters && (
          <button type="button" onClick={() => { setTemplate(undefined); setSources([]); setCity(""); }} className="self-start text-[13px] font-medium text-accent-text underline underline-offset-4">Rensa filter</button>
        )}
        </div>

        <div className="border-t border-gray-100 pt-4">
          {changed && <p className="mb-3 text-[12px] text-gray-500">Använd bygger en ny lista med de här valen.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-12 rounded-full border border-gray-300 px-6 text-[15px] font-semibold text-gray-800 hover:border-gray-500">Avbryt</button>
            <button type="submit" className="h-12 flex-1 rounded-full bg-ink px-5 text-[15px] font-semibold text-white">Använd</button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
