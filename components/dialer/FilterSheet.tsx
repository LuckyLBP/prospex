"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dialerHref } from "@/lib/dialer/scope";
import { QUEUE_ORDERS } from "@/lib/dialer/order";
import { queueOrderAction } from "@/app/app/actions";
import Select from "@/components/ui/Select";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import Sheet from "./Sheet";
import type { DialerInit } from "./types";

const FIELD = "h-11 w-full rounded-full border border-gray-200 bg-white px-4 text-[14px] outline-none transition-colors hover:border-gray-300 focus:border-accent placeholder:text-gray-400";

/** Källa, ort och ordning på kön. Ligger i ett blad så att kön själv får plats i det smala läget. */
export default function FilterSheet({ init, here, onClose }: { init: DialerInit; here: string; onClose: () => void }) {
  const router = useRouter();
  const { scope } = init;
  const [city, setCity] = useState(scope.city ?? "");
  const go = (href: string) => { onClose(); router.push(href); };

  return (
    <Sheet title="Filter" onClose={onClose}>
      <div className="flex flex-col gap-4 pb-1">
        <label className="block text-[12px] font-medium text-gray-500">Källa
          <div className="mt-1">
            <Select
              ariaLabel="Leverantör eller lista"
              value={scope.profileSlug ?? ""}
              onChange={(v) => go(dialerHref({ ...scope, profileSlug: v || null }))}
              options={[{ value: "", label: "Alla källor" }, ...init.suppliers.map((s) => ({ value: s.slug, label: s.name, group: s.kind === "supplier" ? "Leverantörer" : (s.category ?? "Listor"), hint: s.n.toLocaleString("sv-SE"), icon: <SupplierLogo name={s.name} logo={s.logo} size={20} fallback={s.kind === "list" ? <CategoryIcon icon={s.icon} size={12} /> : undefined} /> }))]}
              searchable
              className="w-full"
            />
          </div>
        </label>

        <form onSubmit={(e) => { e.preventDefault(); go(dialerHref({ ...scope, city: city.trim() || undefined })); }}>
          <label className="block text-[12px] font-medium text-gray-500">Ort
            <div className="mt-1 flex gap-2">
              <input aria-label="Ort" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Till exempel Malmö" className={FIELD} />
              <button className="h-11 shrink-0 rounded-full bg-ink px-5 text-[14px] font-semibold text-white">Använd</button>
            </div>
          </label>
        </form>

        {scope.mode === "new" && (
          <label className="block text-[12px] font-medium text-gray-500">Ordning
            <div className="mt-1">
              <Select
                ariaLabel="Ordning"
                value={init.order}
                onChange={(v) => { const fd = new FormData(); fd.set("order", v); fd.set("redirect_to", here); onClose(); void queueOrderAction(fd); }}
                options={QUEUE_ORDERS.map((o) => ({ value: o.value, label: o.label }))}
                className="w-full"
              />
            </div>
          </label>
        )}

        {(scope.profileSlug || scope.city) && (
          <button type="button" onClick={() => go(dialerHref({ ...scope, profileSlug: null, city: undefined }))} className="self-start text-[13px] font-medium text-accent-text underline underline-offset-4">Rensa filter</button>
        )}
      </div>
    </Sheet>
  );
}
