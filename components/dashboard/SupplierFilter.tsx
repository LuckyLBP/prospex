"use client";

import { useState } from "react";
import Select from "@/components/ui/Select";
import SupplierLogo from "@/components/ui/SupplierLogo";

/** Leverantörsvalet i listformuläret. Skickas som fältet `supplier` när formuläret skickas in. */
export default function SupplierFilter({ value, suppliers }: { value: string; suppliers: { slug: string; name: string; n: number; logo: string | null; kind: "supplier" | "list"; category: string | null }[] }) {
  const [v, setV] = useState(value);
  return (
    <Select
      name="supplier"
      ariaLabel="Leverantör eller lista"
      value={v}
      onChange={setV}
      searchable
      className="!h-[42px] !rounded-xl !pl-4"
      options={[{ value: "", label: "Alla källor" }, ...suppliers.map((s) => ({ value: s.slug, label: s.name, group: s.kind === "supplier" ? "Leverantörer" : (s.category ?? "Listor"), hint: s.n.toLocaleString("sv-SE"), icon: <SupplierLogo name={s.name} logo={s.logo} size={20} /> }))]}
    />
  );
}
