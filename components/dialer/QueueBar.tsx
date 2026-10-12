"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleHelp, RefreshCw } from "lucide-react";
import { dialerHref, type QueueMode } from "@/lib/dialer/scope";
import { QUEUE_ORDERS } from "@/lib/dialer/order";
import { queueOrderAction } from "@/app/app/actions";
import Select from "@/components/ui/Select";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import type { DialerInit } from "./types";

const MODES: { mode: QueueMode; label: string }[] = [
  { mode: "new", label: "Att ringa" },
  { mode: "callbacks", label: "Återkomster" },
  { mode: "mine", label: "Mina" },
];

export default function QueueBar({ init, here, callsToday, left, onHelp, onRefresh, refreshing }: {
  init: DialerInit; here: string; callsToday: number; left: number; onHelp: () => void; onRefresh: () => void; refreshing: boolean;
}) {
  const router = useRouter();
  const { scope } = init;
  const [city, setCity] = useState(scope.city ?? "");
  const sel = "h-9 rounded-full border border-gray-200 bg-white px-3.5 text-[13px] outline-none transition-colors hover:border-gray-300 focus:border-[#F26522] placeholder:text-gray-400";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3xl bg-white px-4 py-3">
      <div className="flex gap-1 rounded-full bg-[#F4F4F1] p-1">
        {MODES.map(({ mode, label }) => (
          <Link key={mode} href={dialerHref({ ...scope, mode })} className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${scope.mode === mode ? "bg-[#14161F] text-white" : "text-gray-700 hover:bg-white"}`}>
            {label}
          </Link>
        ))}
      </div>

      <Select
        ariaLabel="Leverantör eller lista"
        value={scope.profileSlug ?? ""}
        onChange={(v) => router.push(dialerHref({ ...scope, profileSlug: v || null }))}
        options={[{ value: "", label: "Alla källor" }, ...init.suppliers.map((s) => ({ value: s.slug, label: s.name, group: s.kind === "supplier" ? "Leverantörer" : (s.category ?? "Listor"), hint: s.n.toLocaleString("sv-SE"), icon: <SupplierLogo name={s.name} logo={s.logo} size={20} fallback={s.kind === "list" ? <CategoryIcon icon={s.icon} size={12} /> : undefined} /> }))]}
        searchable
        className="w-[190px]"
      />

      <form onSubmit={(e) => { e.preventDefault(); router.push(dialerHref({ ...scope, city: city.trim() || undefined })); }}>
        <input aria-label="Ort" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ort" className={`${sel} w-24`} />
      </form>

      {scope.mode === "new" && (
        <Select
          ariaLabel="Ordning"
          value={init.order}
          onChange={(v) => { const fd = new FormData(); fd.set("order", v); fd.set("redirect_to", here); void queueOrderAction(fd); }}
          options={QUEUE_ORDERS.map((o) => ({ value: o.value, label: o.label }))}
          className="w-[120px]"
        />
      )}

      <div className="ml-auto flex items-center gap-3 text-[13px] text-gray-600">
        <span className="whitespace-nowrap"><span className="font-semibold text-[#14161F]">{callsToday}</span> idag</span>
        <span className="text-gray-300">|</span>
        <span className="whitespace-nowrap"><span className="font-semibold text-[#14161F]">{left}{init.capped ? "+" : ""}</span> kvar</span>
        <button onClick={onRefresh} title="Uppdatera kön" aria-label="Uppdatera kön" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /></button>
        <button onClick={onHelp} title="Tangentbordsgenvägar (?)" aria-label="Tangentbordsgenvägar" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><CircleHelp size={17} /></button>
      </div>
    </div>
  );
}
