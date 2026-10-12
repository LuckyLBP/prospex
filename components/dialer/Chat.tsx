"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ArrowUp } from "lucide-react";
import OutcomePill from "@/components/dashboard/OutcomePill";
import { buildTimeline } from "@/lib/dialer/timeline";
import type { DialerCard } from "@/lib/dialer/card-types";

const time = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayKey = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(iso));
const dayLabel = (iso: string) => {
  const today = dayKey(new Date().toISOString());
  const y = dayKey(new Date(Date.now() - 86400_000).toISOString());
  const k = dayKey(iso);
  if (k === today) return "Idag";
  if (k === y) return "Igår";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(new Date(iso));
};
const who = (email: string) => { const n = email.split("@")[0] ?? ""; return n ? n.charAt(0).toUpperCase() + n.slice(1) : email; };
const shortDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" }).format(new Date(iso));

type Props = {
  card: DialerCard;
  me: string;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  composerRef: React.RefObject<HTMLTextAreaElement>;
};

/**
 * Tråden för ett företag: tidigare samtal och anteckningar som pratbubblor, äldst överst, och ett fält
 * för nya anteckningar längst ner. Enter skickar, Shift+Enter ger ny rad. Det som står i fältet när
 * samtalet sparas följer med samtalet, så ingen text går förlorad.
 */
export default function Chat({ card, me, draft, onDraft, onSend, composerRef }: Props) {
  const items = useMemo(() => buildTimeline(card.logs, card.notes), [card.logs, card.notes]);
  const list = useRef<HTMLDivElement>(null);

  // Alltid längst ner, vid nytt kort och vid nya inlägg.
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [card.id, items.length]);

  // Fältet växer med texten, upp till fyra rader.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
  }, [draft, composerRef]);

  let lastDay = "";
  return (
    <section aria-label="Anteckningar och samtal" className="flex min-h-[260px] flex-1 flex-col rounded-2xl bg-[#F7F7F4]">
      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-2 pt-4">
        {items.length === 0 && (
          <p className="m-auto max-w-[260px] text-center text-[13px] leading-relaxed text-gray-500">Inga samtal eller anteckningar än. Det du skriver här ser alla i bolaget.</p>
        )}
        {items.map((it) => {
          const day = dayKey(it.at);
          const sep = day !== lastDay ? <div key={`d-${it.at}`} className="my-1 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">{dayLabel(it.at)}</div> : null;
          lastDay = day;

          if (it.kind === "call") {
            const l = it.log;
            return (
              <div key={`c-${it.at}-${l.userEmail}`} className="flex flex-col gap-1.5">
                {sep}
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-gray-500">
                  <OutcomePill outcome={l.outcome} />
                  <span>{who(l.userEmail)} · {time(l.calledAt)}</span>
                  {l.callbackAt && <span className="text-amber-700">Ring igen {shortDay(l.callbackAt)}</span>}
                  {l.meetingAt && <span className="text-emerald-700">Möte {shortDay(l.meetingAt)} {time(l.meetingAt)}</span>}
                </div>
                {l.note && <Bubble mine={l.userEmail === me} who={who(l.userEmail)} at={l.calledAt} text={l.note} />}
              </div>
            );
          }
          const n = it.note;
          return (
            <div key={`n-${n.id}`} className="flex flex-col gap-1.5">
              {sep}
              <Bubble mine={n.userEmail === me} who={who(n.userEmail)} at={n.createdAt} text={n.body} pending={n.id.startsWith("tmp-")} />
            </div>
          );
        })}
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1">
        <div className="flex items-end gap-2 rounded-2xl bg-white p-2 ring-1 ring-black/[0.06] focus-within:ring-2 focus-within:ring-[#F26522]/40">
          <textarea
            ref={composerRef}
            rows={1}
            maxLength={2000}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); }
            }}
            placeholder="Skriv en anteckning"
            aria-label="Skriv en anteckning"
            className="max-h-[104px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-snug outline-none placeholder:text-gray-400"
          />
          <button type="button" onClick={onSend} disabled={!draft.trim()} aria-label="Skicka anteckning" onMouseDown={(e) => e.preventDefault()} className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#14161F] text-white disabled:bg-gray-200 disabled:text-gray-400">
            <ArrowUp size={16} />
          </button>
        </div>
        <p className="mt-1.5 px-2 text-[11px] text-gray-400">Enter skickar · Skift Enter ny rad · ⌘ Enter sparar samtalet</p>
      </div>
    </section>
  );
}

function Bubble({ mine, who, at, text, pending }: { mine: boolean; who: string; at: string; text: string; pending?: boolean }) {
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${mine ? "rounded-br-md bg-[#14161F] text-white" : "rounded-bl-md bg-white text-gray-900 ring-1 ring-black/[0.05]"} ${pending ? "opacity-60" : ""}`}>{text}</div>
      <span className="mt-0.5 px-1 text-[11px] text-gray-400">{mine ? "Du" : who} · {time(at)}</span>
    </div>
  );
}
