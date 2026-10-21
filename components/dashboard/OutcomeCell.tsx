"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown } from "@/components/brand/icons";
import OutcomeMenu from "@/components/dialer/OutcomeMenu";
import OutcomePill from "./OutcomePill";
import { saveCall } from "@/app/app/actions";
import { outcomeInfo, type CallOutcome } from "@/lib/calls/outcomes";
import { placeMenu, type Placement } from "@/lib/menu-place";

const MENU_WIDTH = 264;
const MENU_HEIGHT = 440;
const field = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-accent";

/**
 * "Utfall" i listan: klicka för att öppna samma meny som i ringläget och logga samtalet direkt härifrån. De flesta utfall
 * sparas med ett klick. "Ring igen" frågar efter när (valfritt) och "Möte bokat" efter datum och tid (krävs), eftersom ett möte
 * inte går att logga utan. Menyn ligger i ett eget lager över sidan, så att tabellens rullning inte klipper den.
 */
export default function OutcomeCell({ companyId, outcome }: { companyId: string; outcome: CallOutcome | null }) {
  const router = useRouter();
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const layer = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<CallOutcome | null>(outcome);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Placement>({ left: 0, top: 0 });
  const [ask, setAsk] = useState<CallOutcome | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [meeting, setMeeting] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Listan läses om från servern efter ett samtal: håll cellen i takt med den.
  useEffect(() => setCurrent(outcome), [outcome]);

  const close = () => { setOpen(false); setAsk(null); setError(null); };

  // Rullning och ändrad fönsterstorlek flyttar knappen: stäng hellre än att lämna menyn kvar på fel ställe.
  useEffect(() => {
    if (!open) return;
    const onMove = () => close();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => { window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
  }, [open]);

  // Medan datumsteget visas är det inte menyn som lyssnar: stäng med Esc eller ett klick utanför.
  useEffect(() => {
    if (!open || !ask) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent | TouchEvent) => { if (layer.current && !layer.current.contains(e.target as Node)) close(); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open, ask]);

  function toggle() {
    // Ett klick på knappen medan menyn är öppen stängs redan av klicket utanför menyn: öppna den inte igen.
    if (wasOpen.current) { wasOpen.current = false; return; }
    const r = button.current!.getBoundingClientRect();
    setPos(placeMenu(r, { width: window.innerWidth, height: window.innerHeight }, { width: MENU_WIDTH, height: MENU_HEIGHT }));
    setOpen(true);
  }

  function save(o: CallOutcome, extra: { callbackDate?: string; callbackTime?: string; meetingAt?: string } = {}) {
    setError(null);
    start(async () => {
      const res = await saveCall({ companyId, outcome: o, note: "", callbackDate: extra.callbackDate || null, callbackTime: extra.callbackTime || null, meetingAt: extra.meetingAt || null, archive: false });
      if (!res.ok) { setError(res.error); return; }
      setCurrent(o);
      close();
      router.refresh();
    });
  }

  function pick(o: CallOutcome) {
    const info = outcomeInfo(o);
    // Ring igen och möte behöver en tid: fråga först. Övriga sparas direkt.
    if (o === "callback" || info.meeting) { setAsk(o); return; }
    save(o);
  }

  const style: React.CSSProperties = { position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Logga samtal"
        onMouseDown={() => { wasOpen.current = open; }}
        onClick={toggle}
        className="group -mx-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <OutcomePill outcome={current} />
        <ChevronDown size={13} className="text-gray-300 group-hover:text-gray-500" aria-hidden />
      </button>

      {open && createPortal(
        <div ref={layer} style={style} className="z-50">
          {!ask ? (
            <OutcomeMenu selected={current} onPick={pick} onClose={close} className="dialer-toast relative" />
          ) : (
            <form
              className="dialer-toast rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
              onSubmit={(e) => {
                e.preventDefault();
                if (ask === "callback") save(ask, { callbackDate: date, callbackTime: time });
                else save(ask, { meetingAt: meeting });
              }}
            >
              <p className="text-[14px] font-semibold text-ink">{outcomeInfo(ask).label}</p>
              {ask === "callback" ? (
                <>
                  <p className="mt-0.5 text-[12px] text-gray-500">När ska du ringa igen? Du kan lämna det tomt.</p>
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum" className={field} />
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Tid" className={field} />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-0.5 text-[12px] text-gray-500">När är mötet? Datum och tid behövs.</p>
                  <input type="datetime-local" required value={meeting} onChange={(e) => setMeeting(e.target.value)} aria-label="Datum och tid" className={`mt-3 ${field}`} />
                </>
              )}
              {error && <p role="alert" className="mt-2 text-[12px] text-rose-700">{error}</p>}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { setAsk(null); setError(null); }} className="rounded-full border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-canvas">Tillbaka</button>
                <button disabled={pending || (ask !== "callback" && !meeting)} className="flex-1 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{pending ? "Sparar…" : "Spara"}</button>
              </div>
            </form>
          )}
          {!ask && (pending || error) && (
            <p role={error ? "alert" : "status"} className={`mt-2 rounded-xl px-3 py-2 text-[12px] shadow-sm ${error ? "bg-rose-50 text-rose-800" : "bg-white text-gray-600"}`}>{error ?? "Sparar…"}</p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
