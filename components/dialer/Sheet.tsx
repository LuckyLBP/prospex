"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Ett blad från botten på telefon och en centrerad ruta på större skärmar. Används för utfallet, filtren och
 * valet av företag att skanna. `data-dialog-open` gör att ringlägets tangentgenvägar tiger medan bladet är öppet.
 * Bredden sätts i globals.css (.dialer-sheet). Innehållet rullar inte i bladet, så att en rullista inte klipps av.
 */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Esc stänger bladet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title} data-dialog-open="">
      <button type="button" aria-label="Stäng" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="dialer-sheet relative flex max-h-[88dvh] flex-col rounded-t-3xl bg-white pt-2 sm:rounded-3xl sm:pt-0">
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Stäng" className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
