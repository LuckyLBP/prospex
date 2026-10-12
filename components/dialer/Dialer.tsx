"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PartyPopper, Phone, Undo2, X } from "lucide-react";
import CompanyPanel from "./CompanyPanel";
import CallPanel, { type CallFormState } from "./CallPanel";
import QueueBar from "./QueueBar";
import ShortcutsDialog from "./ShortcutsDialog";
import RegistryDialog from "./RegistryDialog";
import type { DialerInit } from "./types";
import type { DialerCard } from "@/lib/dialer/card-types";
import { CLAIM_RENEW_MS, claimWarning, parseClaim, skipReason, type ClaimStatus } from "@/lib/dialer/claim";
import { dialerHref } from "@/lib/dialer/scope";
import { keyAction, type KeyInput } from "@/lib/dialer/keys";
import { missingIds } from "@/lib/dialer/window";
import { defaultMeeting } from "@/lib/dialer/quickdates";
import { outcomeInfo, outcomeLabel, type CallOutcome } from "@/lib/calls/outcomes";
import { addNote, saveCall, undoCallAction } from "@/app/app/actions";

const EMPTY: CallFormState = { outcome: null, cbDate: "", cbTime: "", meeting: "", archive: false };

type Toast =
  | { key: number; kind: "undo"; text: string; companyId: string; logId: string | null; meeting: boolean }
  | { key: number; kind: "info" | "error"; text: string };

const targetKind = (el: EventTarget | null): KeyInput["target"] => {
  const e = el as HTMLElement | null;
  if (!e || !e.tagName) return "other";
  if (e.closest?.("[data-hotkeys-off]")) return "field"; // egna rullistor hanterar sina tangenter själva
  if (e.isContentEditable) return "field";
  if (e.tagName === "TEXTAREA" || e.tagName === "SELECT") return "field";
  if (e.tagName === "INPUT") return ["checkbox", "radio", "button", "submit"].includes((e as HTMLInputElement).type) ? "button" : "field";
  if (e.tagName === "BUTTON" || e.tagName === "A" || e.tagName === "SUMMARY") return "button";
  return "other";
};

function ToastView({ toast, onUndo, onClose, className }: { toast: Toast; onUndo: () => void; onClose: () => void; className?: string }) {
  return (
    <div key={toast.key} className={`dialer-toast flex items-center gap-2 rounded-2xl bg-[#14161F] py-2 pl-4 pr-2 text-[13px] text-white ${className ?? ""}`}>
      <span className="min-w-0 flex-1 truncate">{toast.kind === "undo" ? `Sparat: ${toast.text}` : toast.text}</span>
      {toast.kind === "undo" && (
        <button onClick={onUndo} disabled={!toast.logId} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25 disabled:opacity-50">
          <Undo2 size={14} />Ångra <kbd className="rounded bg-white/20 px-1 text-[11px]">Z</kbd>
        </button>
      )}
      <button onClick={onClose} aria-label="Stäng" className="rounded-full p-1.5 text-white/60 hover:text-white"><X size={14} /></button>
    </div>
  );
}

export default function Dialer({ init }: { init: DialerInit }) {
  const router = useRouter();
  const { ids } = init;
  const [index, setIndex] = useState(init.startIndex);
  const [cards, setCards] = useState<Record<string, DialerCard>>(() => Object.fromEntries(init.cards.map((c) => [c.id, c])));
  const [form, setForm] = useState<CallFormState>(EMPTY);
  const [toast, setToast] = useState<Toast | null>(null);
  const [claim, setClaim] = useState<ClaimStatus | null>(null);
  const [help, setHelp] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Utkast till anteckning, ett per företag, så att inget går förlorat när man hoppar fram och tillbaka.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState({ calls: 0, meetings: 0 });

  const dir = useRef<"fwd" | "back">("fwd");
  const inflight = useRef(new Set<string>());
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const meetingRef = useRef<HTMLInputElement>(null);
  const toastSeq = useRef(0);

  const currentId = ids[index];
  const card = currentId ? cards[currentId] : undefined;
  const done = index >= ids.length;
  const draft = (currentId && drafts[currentId]) || "";
  const setDraft = useCallback((id: string, v: string) => setDrafts((d) => ({ ...d, [id]: v })), []);

  const info = form.outcome ? outcomeInfo(form.outcome) : null;
  const meetingOk = !info?.meeting || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.meeting);
  const canSave = !!card && !!form.outcome && meetingOk;
  const reason = !card ? "Laddar företaget" : !form.outcome ? "Välj utfall med 1 till 0" : !meetingOk ? "Ange mötets datum och tid" : null;
  const here = dialerHref(init.scope);

  const say = useCallback((kind: "info" | "error", text: string) => setToast({ key: ++toastSeq.current, kind, text }), []);

  const go = useCallback((to: number, direction: "fwd" | "back") => {
    dir.current = direction;
    setIndex(Math.max(0, Math.min(ids.length, to)));
    setForm(EMPTY);
    setClaim(null);
    setRevealed(false);
    setRegistryOpen(false);
  }, [ids.length]);

  // Hämta korten runt aktuell plats i förväg, så att nästa kort är en ren setState.
  useEffect(() => {
    const need = missingIds(ids, index, new Set(Object.keys(cards))).filter((id) => !inflight.current.has(id));
    if (need.length === 0) return;
    need.forEach((id) => inflight.current.add(id));
    fetch(`/api/dialer/cards?ids=${need.join(",")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { cards: DialerCard[] }) => setCards((prev) => ({ ...prev, ...Object.fromEntries(d.cards.map((c) => [c.id, c])) })))
      .catch(() => say("error", "Kunde inte hämta fler företag. Kontrollera uppkopplingen."))
      .finally(() => need.forEach((id) => inflight.current.delete(id)));
  }, [ids, index, cards, say]);

  const refreshCard = useCallback((id: string) => {
    fetch(`/api/dialer/cards?ids=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { cards: DialerCard[] } | null) => d && setCards((prev) => ({ ...prev, ...Object.fromEntries(d.cards.map((c) => [c.id, c])) })))
      .catch(() => {});
  }, []);

  // Reservera företaget medan kortet är öppet, och hoppa över det om en kollega har det eller nyss ringt.
  useEffect(() => {
    if (!currentId) return;
    let alive = true;
    const run = async () => {
      try {
        const res = await fetch("/api/dialer/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: currentId }) });
        if (!res.ok || !alive) return;
        const s = parseClaim(await res.json());
        setClaim(s);
        const why = dir.current === "fwd" ? skipReason(s, init.queueBuiltAt) : null; // bakåt hoppar vi aldrig
        if (why && alive) {
          alive = false;
          const name = cards[currentId]?.name ?? "Företaget";
          say("info", `Hoppade över ${name}: ${why}.`);
          go(index + 1, "fwd");
        }
      } catch { /* nästa förnyelse försöker igen */ }
    };
    run();
    const t = setInterval(run, CLAIM_RENEW_MS);
    return () => { alive = false; clearInterval(t); };
    // `cards` och `go` ändras utan att reservationen ska göras om.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, index, init.queueBuiltAt]);

  // Adressen speglar aktuellt företag, så en omladdning hamnar på samma kort.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (currentId) url.searchParams.set("c", currentId); else url.searchParams.delete("c");
    window.history.replaceState(window.history.state, "", url);
  }, [currentId]);

  // Rutor försvinner av sig själva (ångra-rutan efter 10 s).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.key === toast.key ? null : cur)), toast.kind === "undo" ? 10_000 : 4_500);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = useCallback((p: Partial<CallFormState>) => setForm((f) => ({ ...f, ...p })), []);

  const pick = useCallback((o: CallOutcome) => {
    const i = outcomeInfo(o);
    setForm((f) => ({
      ...f,
      outcome: o,
      // Fält som det nya utfallet inte använder rensas, så ett spöke från förra valet inte hänger kvar.
      cbDate: i.callback ? f.cbDate : "",
      cbTime: i.callback ? f.cbTime : "",
      meeting: i.meeting ? f.meeting || defaultMeeting() : "",
      archive: i.terminal,
    }));
    if (i.meeting) setTimeout(() => meetingRef.current?.focus(), 0);
  }, []);

  const submit = useCallback(async () => {
    if (!card || !canSave || !form.outcome) return;
    const note = draft.trim();
    const snapshot = { index, form, id: card.id, draft };
    const i = outcomeInfo(form.outcome);
    const key = ++toastSeq.current;
    setSession((s) => ({ calls: s.calls + 1, meetings: s.meetings + (i.meeting ? 1 : 0) }));
    setToast({ key, kind: "undo", text: `${outcomeLabel(form.outcome)}: ${card.name ?? "företaget"}`, companyId: card.id, logId: null, meeting: i.meeting });
    setDraft(card.id, ""); // utkastet följer med samtalet och visas i tråden
    go(index + 1, "fwd"); // gå vidare direkt, servern sparar i bakgrunden

    const r = await saveCall({
      companyId: card.id, outcome: form.outcome, note, archive: form.archive,
      callbackDate: form.cbDate || null, callbackTime: form.cbTime || null, meetingAt: form.meeting || null,
    });
    if (!r.ok) {
      setSession((s) => ({ calls: s.calls - 1, meetings: s.meetings - (i.meeting ? 1 : 0) }));
      go(snapshot.index, "back");
      setForm(snapshot.form);
      setDraft(snapshot.id, snapshot.draft);
      say("error", r.error);
      return;
    }
    setToast((t) => (t && t.kind === "undo" && t.key === key ? { ...t, logId: r.logId } : t));
    refreshCard(snapshot.id);
  }, [card, canSave, form, draft, index, go, say, refreshCard, setDraft]);

  const undo = useCallback(async () => {
    if (!toast || toast.kind !== "undo" || !toast.logId) return;
    const t = toast;
    setToast(null);
    const r = await undoCallAction(t.logId!);
    if (!r.ok) { say("error", r.error); return; }
    setSession((s) => ({ calls: Math.max(0, s.calls - 1), meetings: Math.max(0, s.meetings - (t.meeting ? 1 : 0)) }));
    const at = ids.indexOf(t.companyId);
    if (at >= 0) go(at, "back");
    refreshCard(t.companyId);
    say("info", "Samtalet är ångrat.");
  }, [toast, ids, go, say, refreshCard]);

  const copy = useCallback(async () => {
    if (!card?.phone) return;
    try { await navigator.clipboard.writeText(card.phone); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { say("error", "Kunde inte kopiera."); }
  }, [card, say]);

  const sendNote = useCallback(async () => {
    if (!card) return;
    const text = draft.trim();
    if (!text) return;
    const tmp = { id: `tmp-${Date.now()}`, body: text, createdAt: new Date().toISOString(), userEmail: init.me };
    const id = card.id;
    setCards((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], notes: [...prev[id].notes, tmp] } } : prev));
    setDraft(id, "");
    const r = await addNote(id, text);
    setCards((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], notes: prev[id].notes.filter((n) => n.id !== tmp.id).concat(r.ok ? [r.note] : []) } } : prev));
    if (!r.ok) { setDraft(id, text); say("error", r.error); }
  }, [card, draft, init.me, setDraft, say]);

  // Första trycket visar numret, nästa ringer.
  const callOrReveal = useCallback(() => {
    if (!card?.phone) return;
    if (!revealed) { setRevealed(true); return; }
    window.location.href = `tel:${card.phone}`;
  }, [card, revealed]);

  const refreshQueue = useCallback(() => { setRefreshing(true); router.refresh(); }, [router]);

  // En global tangentlyssnare. Själva reglerna ligger i lib/dialer/keys.ts och är testade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = keyAction({ key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, target: targetKind(e.target), canSave, dialogOpen: help || registryOpen });
      if (!a) return;
      e.preventDefault();
      switch (a.type) {
        case "outcome": if (card) pick(a.value); break;
        case "save": submit(); break;
        case "skip": if (!done) go(index + 1, "fwd"); break;
        case "back": if (index > 0) go(index - 1, "back"); break;
        case "note": composerRef.current?.focus(); break;
        case "call": callOrReveal(); break;
        case "copy": copy(); break;
        case "undo": undo(); break;
        case "help": setHelp(true); break;
        case "info": if (card) setRegistryOpen(true); break;
        case "close": setHelp(false); setRegistryOpen(false); break;
        case "blur": (document.activeElement as HTMLElement | null)?.blur(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, help, registryOpen, card, done, index, pick, submit, go, copy, undo, callOrReveal]);

  const warning = claimWarning(claim);
  const callsToday = init.stats.callsToday + session.calls;
  const left = Math.max(0, ids.length - index);

  return (
    <div className="flex flex-col gap-4 xl:h-[calc(100vh-6rem)] xl:min-h-[560px]">
      <QueueBar init={init} here={here} callsToday={callsToday} left={left} onHelp={() => setHelp(true)} onRefresh={refreshQueue} refreshing={refreshing} />

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-3xl bg-white px-6 py-16 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE3D2] text-[#F26522]"><PartyPopper size={26} /></span>
          <h2 className="text-[22px] font-semibold text-[#14161F]">{ids.length === 0 ? "Kön är tom" : "Kön är slut"}</h2>
          <p className="mt-2 max-w-md text-[14px] text-gray-600">
            {session.calls > 0
              ? `Du ringde ${session.calls} samtal${session.meetings > 0 ? ` och bokade ${session.meetings} möte${session.meetings === 1 ? "" : "n"}` : ""} den här omgången. Bra jobbat.`
              : init.scope.mode === "callbacks" ? "Du har inga återringningar för i dag." : "Det finns inga fler företag med telefonnummer som matchar filtret och som inte redan är ringda eller omhändertagna."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={refreshQueue} className="rounded-full bg-[#14161F] px-5 py-2.5 text-[14px] font-semibold text-white">Uppdatera kön</button>
            <Link href="/app/bygg-lista" className="rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-semibold">Ändra filter</Link>
            {index > 0 && <button onClick={() => go(index - 1, "back")} className="rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-semibold">Gå tillbaka</button>}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-h-0 flex-col overflow-y-auto rounded-3xl bg-white p-6 pb-24 sm:p-7 xl:pb-7">
            {warning && <div className="mb-4 rounded-2xl bg-amber-50 px-5 py-3 text-[13px] text-amber-900">{warning}</div>}
            {card ? (
              <div key={card.id} className="dialer-in flex min-h-0 flex-1 flex-col">
                <CompanyPanel card={card} mode={init.scope.mode} me={init.me} copied={copied} onCopy={copy} revealed={revealed} onReveal={() => setRevealed(true)} draft={draft} onDraft={(v) => setDraft(card.id, v)} onSendNote={sendNote} composerRef={composerRef} onShowRegistry={() => setRegistryOpen(true)} />
              </div>
            ) : (
              <div className="space-y-4" aria-busy="true" aria-label="Laddar företaget">
                <div className="h-6 w-1/3 animate-pulse rounded-full bg-[#F4F4F1]" /><div className="h-10 w-2/3 animate-pulse rounded-2xl bg-[#F4F4F1]" /><div className="h-14 w-1/2 animate-pulse rounded-2xl bg-[#F4F4F1]" /><div className="h-32 animate-pulse rounded-2xl bg-[#F4F4F1]" />
              </div>
            )}
          </div>
          <div className="min-h-0 rounded-3xl bg-white p-6 xl:overflow-hidden">
            <CallPanel
              form={form} onChange={patch} onPick={pick} canSave={canSave} reason={reason}
              onSubmit={submit} onSkip={() => go(index + 1, "fwd")} onBack={() => go(index - 1, "back")} canBack={index > 0}
              meetingRef={meetingRef}
              status={toast ? <div aria-live="polite" className="hidden xl:block"><ToastView toast={toast} onUndo={undo} onClose={() => setToast(null)} /></div> : undefined}
            />
          </div>
        </div>
      )}

      {/* Smal skärm: ringa och spara alltid inom räckhåll. */}
      {!done && card && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-black/5 bg-white/95 p-3 backdrop-blur xl:hidden">
          {card.phone && <a href={`tel:${card.phone}`} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#14161F] py-3 text-[15px] font-semibold text-white"><Phone size={17} className="text-[#F26522]" />Ring</a>}
          <button onClick={submit} disabled={!canSave} className="flex-1 rounded-full bg-[#F26522] py-3 text-[15px] font-semibold text-white disabled:opacity-40">Spara</button>
        </div>
      )}

      {toast && (
        <div aria-live="polite" className="fixed inset-x-3 bottom-20 z-40 xl:hidden">
          <ToastView toast={toast} onUndo={undo} onClose={() => setToast(null)} className="shadow-lg" />
        </div>
      )}

      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      {registryOpen && card && <RegistryDialog companyId={card.id} name={card.name} onClose={() => setRegistryOpen(false)} onOrgnrSaved={() => refreshCard(card.id)} />}
    </div>
  );
}
