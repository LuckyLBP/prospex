"use client";

import { useEffect, useRef } from "react";
import { SkipForward } from "@/components/brand/icons";
import { OUTCOMES, OUTCOME_GROUPS, type CallOutcome } from "@/lib/calls/outcomes";

const DOT: Record<string, string> = {
  neutral: "bg-gray-300",
  primary: "bg-ink",
  success: "bg-emerald-500",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
};

/**
 * Menyn bakom "Logga samtal": utfallen i grupper och sist "Hoppa över". Öppnas uppåt från knappen i nedre fältet.
 * Stängs med Esc, ett klick utanför eller ett val. Siffertangenterna fungerar som förut, med eller utan menyn, och
 * nästa-tangenten (S eller →) öppnar den och hoppar till nästa företag när den trycks igen.
 */
export default function OutcomeMenu({ selected, onPick, onSkip, onClose, className = "dialer-toast absolute inset-x-0 bottom-full z-40 mb-2" }: { selected: CallOutcome | null; onPick: (o: CallOutcome) => void; onSkip?: () => void; onClose: () => void; /** Placeringen. Som standard öppnas menyn uppåt från knappen i ringläget; listan lägger den på ett eget ställe. */ className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    // Hela delade knappen räknas som innanför, så att pilen kan stänga menyn utan att den öppnas igen.
    const onDown = (e: MouseEvent | TouchEvent) => { const inside = root.current?.parentElement ?? root.current; if (inside && !inside.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [onClose]);

  return (
    <div ref={root} role="menu" aria-label="Hur gick samtalet?" className={`${className} max-h-[min(70dvh,520px)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl`}>
      <p className="px-3 pb-1 pt-2 text-[12px] font-medium text-gray-500">Hur gick samtalet?</p>
      {OUTCOME_GROUPS.map((g) => (
        <div key={g.value} className="py-1">
          <p className="px-3 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">{g.label}</p>
          {OUTCOMES.filter((o) => o.group === g.value).map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected === o.value}
              // Knappen ska inte ta fokus, annars blir Enter "klicka igen" i stället för "spara".
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(o.value)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] ${selected === o.value ? "bg-ink font-semibold text-white" : "text-ink hover:bg-canvas"}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[o.tone]}`} aria-hidden />
              <span className="flex-1">{o.label}</span>
              <kbd className={`hidden rounded px-1.5 text-[11px] font-medium [@media(pointer:fine)]:inline ${selected === o.value ? "bg-white/20" : "bg-black/[0.06] text-gray-500"}`}>{o.key}</kbd>
            </button>
          ))}
        </div>
      ))}
      {onSkip && <div className="mt-1 border-t border-gray-100 pt-1">
        <button type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={onSkip} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] text-gray-700 hover:bg-canvas">
          <SkipForward size={15} className="shrink-0 text-gray-400" />
          <span className="flex-1">Hoppa över</span>
          <kbd className="hidden rounded bg-black/[0.06] px-1.5 text-[11px] font-medium text-gray-500 [@media(pointer:fine)]:inline">S</kbd>
        </button>
      </div>}
    </div>
  );
}
