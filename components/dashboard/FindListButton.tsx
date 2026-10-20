"use client";

import { useFormStatus } from "react-dom";
import { RotateCw, Search } from "@/components/brand/icons";
import { btnPrimary } from "@/components/admin/ui";

/** Knappen i formuläret "Hitta företagen": visar att något händer medan sökningen startas. */
export default function FindListButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-busy={pending} className={btnPrimary}>
      {pending ? <RotateCw size={14} className="animate-spin" /> : <Search size={14} />}
      {pending ? "Startar sökningen…" : "Hitta företagen"}
    </button>
  );
}
