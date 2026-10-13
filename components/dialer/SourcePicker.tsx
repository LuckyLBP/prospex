"use client";

import { useMemo, useState } from "react";
import { Search } from "@/components/brand/icons";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import { MAX_SOURCES } from "@/lib/dialer/scope";
import type { DialerInit } from "./types";

type Source = DialerInit["suppliers"][number];

/**
 * Val av flera källor som en kryssruteslista: sök, bocka i och ur, och listan stannar öppen medan man väljer.
 * Inga valda källor betyder alla. Källorna kommer redan sorterade så att samma rubrik ligger intill varandra.
 */
export default function SourcePicker({ suppliers, value, onChange }: { suppliers: Source[]; value: string[]; onChange: (slugs: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? suppliers.filter((s) => s.name.toLowerCase().includes(needle)) : suppliers;
  }, [suppliers, q]);
  const chosen = new Set(value);
  const toggle = (slug: string) => {
    if (chosen.has(slug)) onChange(value.filter((x) => x !== slug));
    else if (value.length < MAX_SOURCES) onChange([...value, slug]);
  };
  const heading = (s: Source) => (s.kind === "supplier" ? "Leverantörer" : (s.category ?? "Listor"));

  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full items-baseline justify-between text-[12px] font-medium text-gray-500">
        <span>Källor</span>
        <span className="flex items-center gap-3">
          <span className={value.length ? "font-semibold text-ink" : ""}>{value.length ? `${value.length} valda` : "Alla källor"}</span>
          {value.length > 0 && <button type="button" onClick={() => onChange([])} className="font-medium text-accent-text underline underline-offset-4">Rensa</button>}
        </span>
      </legend>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <label className="flex items-center gap-2 border-b border-gray-100 px-3.5">
          <Search size={15} className="shrink-0 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} placeholder="Sök källa" aria-label="Sök källa" className="h-11 w-full bg-transparent text-[14px] outline-none placeholder:text-gray-400" />
        </label>
        <ul className="max-h-56 overflow-y-auto py-1" data-hotkeys-off>
          {shown.length === 0 && <li className="px-3.5 py-3 text-[13px] text-gray-500">Inga träffar</li>}
          {shown.map((s, i) => {
            const h = heading(s);
            const newGroup = i === 0 || heading(shown[i - 1]) !== h;
            const on = chosen.has(s.slug);
            return (
              <li key={s.slug}>
                {newGroup && <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{h}</p>}
                <label className={`flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-1.5 hover:bg-canvas ${on ? "bg-accent-wash" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(s.slug)} className="h-4 w-4 shrink-0 accent-accent" />
                  <SupplierLogo name={s.name} logo={s.logo} size={24} fallback={s.kind === "list" ? <CategoryIcon icon={s.icon} size={12} /> : undefined} />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{s.name}</span>
                  <span className="shrink-0 text-[12px] tabular text-gray-400">{s.n.toLocaleString("sv-SE")}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </fieldset>
  );
}
