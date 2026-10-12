import Link from "next/link";
import { Search } from "lucide-react";

type Filter = { key: string; label: string; value: string | undefined; options: { value: string; label: string }[] };

/**
 * Sökruta och filterchips som styrs av adressen (?q=...&status=...), så att allt går att länka till och
 * fungerar utan klientkod. Chips behåller övriga parametrar.
 */
export default function FilterBar({ basePath, q, filters = [], total, noun }: { basePath: string; q?: string; filters?: Filter[]; total?: number; noun?: string }) {
  const href = (key: string, value: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    for (const f of filters) { const v = f.key === key ? value : f.value; if (v) p.set(f.key, v); }
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <form action={basePath} className="flex items-center gap-2 rounded-full bg-white px-4 py-2">
        <Search size={15} className="text-gray-400" />
        {filters.map((f) => f.value && <input key={f.key} type="hidden" name={f.key} value={f.value} />)}
        <input name="q" defaultValue={q ?? ""} placeholder="Sök" aria-label="Sök" className="w-48 bg-transparent text-[14px] outline-none placeholder:text-gray-400" />
      </form>
      {filters.map((f) => (
        <div key={f.key} role="group" aria-label={f.label} className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1">
          {[{ value: "", label: "Alla" }, ...f.options].map((o) => {
            const on = (f.value ?? "") === o.value;
            return <Link key={o.value || "alla"} href={href(f.key, o.value)} aria-current={on ? "true" : undefined} className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium ${on ? "bg-ink text-white" : "text-gray-600 hover:bg-canvas"}`}>{o.label}</Link>;
          })}
        </div>
      ))}
      {total !== undefined && <p className="ml-auto text-[13px] text-gray-500">{total.toLocaleString("sv-SE")} {noun ?? "poster"}</p>}
    </div>
  );
}
