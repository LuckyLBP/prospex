"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const ROWS: [string, string][] = [
  ["1 till 9, 0", "Välj utfall"],
  ["Enter", "Spara och gå till nästa"],
  ["⌘ Enter", "Spara, även från anteckningen"],
  ["S eller →", "Hoppa över"],
  ["←", "Förra företaget"],
  ["V", "Visa numret, tryck igen för att ringa"],
  ["I", "Visa företagsuppgifter"],
  ["N", "Skriv en anteckning"],
  ["Esc", "Lämna anteckningsfältet, tangenterna fungerar igen"],
  ["C", "Kopiera numret"],
  ["Z eller ⌘ Z", "Ångra senaste samtalet"],
  ["?", "Visa den här listan"],
];

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Tangentbordsgenvägar"
        onClick={(e) => e.stopPropagation()}
        className="dialer-toast w-full max-w-[440px] rounded-3xl bg-white p-6 shadow-xl outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-[#14161F]">Tangentbordsgenvägar</h2>
          <button onClick={onClose} aria-label="Stäng" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <dl className="flex flex-col gap-2.5 text-[14px]">
          {ROWS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <dt className="text-gray-700">{v}</dt>
              <dd><kbd className="whitespace-nowrap rounded-lg bg-[#F4F4F1] px-2 py-1 text-[12px] font-medium text-[#14161F]">{k}</kbd></dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
