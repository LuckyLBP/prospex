"use client";

import { useState } from "react";
import { btnDanger, btnSecondary } from "./ui";

/**
 * Knapp för en åtgärd som är svår att ångra. Första klicket visar en kort fråga på samma plats, och först
 * "Ja" skickar formuläret den ligger i. Esc eller "Avbryt" backar.
 */
export default function ConfirmButton({ label, confirmLabel, message, className }: { label: string; confirmLabel: string; message: string; className?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" onClick={() => setAsking(true)} className={className ?? btnSecondary}>{label}</button>;
  }
  return (
    <span role="alertdialog" aria-label={message} onKeyDown={(e) => e.key === "Escape" && setAsking(false)} className="inline-flex flex-wrap items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2">
      <span className="text-[13px] text-rose-900">{message}</span>
      <button type="submit" autoFocus className={btnDanger}>{confirmLabel}</button>
      <button type="button" onClick={() => setAsking(false)} className={btnSecondary}>Avbryt</button>
    </span>
  );
}
