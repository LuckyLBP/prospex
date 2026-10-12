"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ClipboardCheck, PartyPopper, Undo2, X } from "lucide-react";
import CompanyPanel from "./CompanyPanel";
import CallPanel from "./CallPanel";
import { canSaveForm, EMPTY_FORM as EMPTY, menuChoice, withOutcome, type CallFormState } from "@/lib/dialer/outcome-form";
import QueueBar from "./QueueBar";
import ShortcutsDialog from "./ShortcutsDialog";
import RegistryDialog from "./RegistryDialog";
import FilterSheet from "./FilterSheet";
import OutcomeMenu from "./OutcomeMenu";
import type { DialerInit } from "./types";
import type { DialerCard } from "@/lib/dialer/card-types";
import { CLAIM_RENEW_MS, claimWarning, parseClaim, skipReason, type ClaimStatus } from "@/lib/dialer/claim";
import { dialerHref } from "@/lib/dialer/scope";
import { keyAction, type KeyInput } from "@/lib/dialer/keys";
import { missingIds } from "@/lib/dialer/window";
import { outcomeInfo, outcomeLabel, type CallOutcome } from "@/lib/calls/outcomes";
import { addNote, saveCall, undoCallAction } from "@/app/app/actions";


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
          <Undo2 size={14} />Ångra <kbd className="hidden rounded bg-white/20 px-1 text-[11px] [@media(pointer:fine)]:inline">Z</kbd>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Menyn bakom "Logga samtal". */
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const canSave = !!card && canSaveForm(form);
  const here = dialerHref(init.scope);

  const say = useCallback((kind: "info" | "error", text: string) => setToast({ key: ++toastSeq.current, kind, text }), []);

  const go = useCallback((to: number, direction: "fwd" | "back") => {
    dir.current = direction;
    setIndex(Math.max(0, Math.min(ids.length, to)));
    setForm(EMPTY);
    setClaim(null);
    setMenuOpen(false);
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
    setForm((f) => withOutcome(f, o));
    setMenuOpen(false);
    if (i.meeting) setTimeout(() => meetingRef.current?.focus(), 0);
  }, []);

  // Sparar samtalet. Med `override` sparas det utfallet direkt, utan att först väljas i formuläret (valet i menyn).
  const submit = useCallback(async (override?: CallOutcome) => {
    const f = override ? withOutcome(form, override) : form;
    if (!card || !f.outcome) return;
    if (!canSaveForm(f)) return;
    const note = draft.trim();
    const snapshot = { index, form: f, id: card.id, draft };
    const i = outcomeInfo(f.outcome);
    const key = ++toastSeq.current;
    setSession((s) => ({ calls: s.calls + 1, meetings: s.meetings + (i.meeting ? 1 : 0) }));
    setToast({ key, kind: "undo", text: `${outcomeLabel(f.outcome)}: ${card.name ?? "företaget"}`, companyId: card.id, logId: null, meeting: i.meeting });
    setDraft(card.id, ""); // utkastet följer med samtalet och visas i tråden
    go(index + 1, "fwd"); // gå vidare direkt, servern sparar i bakgrunden

    const r = await saveCall({
      companyId: card.id, outcome: f.outcome, note, archive: f.archive,
      callbackDate: f.cbDate || null, callbackTime: f.cbTime || null, meetingAt: f.meeting || null,
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
  }, [card, form, draft, index, go, say, refreshCard, setDraft]);

  // Ett val i menyn sparar och går vidare direkt. Ett möte kräver en tid, så det väljs bara och tiden fylls i först.
  const choose = useCallback((o: CallOutcome) => {
    setMenuOpen(false);
    if (menuChoice(o) === "select") pick(o);
    else void submit(o);
  }, [pick, submit]);

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

  const call = useCallback(() => {
    if (card?.phone) window.location.href = `tel:${card.phone}`;
  }, [card]);

  const refreshQueue = useCallback(() => { setRefreshing(true); router.refresh(); }, [router]);

  // En global tangentlyssnare. Själva reglerna ligger i lib/dialer/keys.ts och är testade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ett öppet blad (filter, val av företag) stänger genvägarna.
      const dialogOpen = help || registryOpen || filtersOpen || !!document.querySelector("[data-dialog-open]");
      const a = keyAction({ key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, target: targetKind(e.target), canSave, dialogOpen });
      if (!a) return;
      e.preventDefault();
      switch (a.type) {
        case "outcome": if (card) pick(a.value); break;
        case "save": submit(); break;
        // Nästa-tangenten öppnar menyn med utfall och Hoppa över. Trycks den igen går det vidare till nästa företag.
        case "skip":
          if (done) break;
          if (menuOpen) { setMenuOpen(false); go(index + 1, "fwd"); } else setMenuOpen(true);
          break;
        case "back": if (index > 0) go(index - 1, "back"); break;
        case "note": composerRef.current?.focus(); break;
        case "call": call(); break;
        case "copy": copy(); break;
        case "undo": undo(); break;
        case "help": setHelp(true); break;
        case "info": if (card) setRegistryOpen(true); break;
        case "close": setHelp(false); setRegistryOpen(false); setFiltersOpen(false); break;
        case "blur": (document.activeElement as HTMLElement | null)?.blur(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, help, registryOpen, filtersOpen, menuOpen, card, done, index, pick, submit, go, copy, undo, call]);

  const warning = claimWarning(claim);
  const callsToday = init.stats.callsToday + session.calls;
  const left = Math.max(0, ids.length - index);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
      <QueueBar init={init} callsToday={callsToday} left={left} onHelp={() => setHelp(true)} onRefresh={refreshQueue} refreshing={refreshing} onFilters={() => setFiltersOpen(true)} />

      {done ? (
        <div className="flex flex-col items-center justify-center rounded-3xl bg-white px-6 py-16 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE3D2] text-[#F26522]"><PartyPopper size={26} /></span>
          <h2 className="text-[22px] font-semibold text-[#14161F]">{ids.length === 0 ? "Kön är tom" : "Kön är slut"}</h2>
          <p className="mt-2 max-w-md text-[14px] text-gray-600">
            {session.calls > 0
              ? `Du ringde ${session.calls} samtal${session.meetings > 0 ? ` och bokade ${session.meetings} möte${session.meetings === 1 ? "" : "n"}` : ""} den här omgången. Bra jobbat.`
              : init.scope.mode === "callbacks" ? "Du har inga återringningar för i dag." : "Det finns inga fler företag med telefonnummer som matchar filtret och som inte redan är ringda eller omhändertagna."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={refreshQueue} className="rounded-full bg-[#14161F] px-5 py-3 text-[14px] font-semibold text-white">Uppdatera kön</button>
            <Link href="/app/bygg-lista" className="rounded-full border border-gray-300 px-5 py-3 text-[14px] font-semibold">Ändra filter</Link>
            {index > 0 && <button onClick={() => go(index - 1, "back")} className="rounded-full border border-gray-300 px-5 py-3 text-[14px] font-semibold">Gå tillbaka</button>}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-5 sm:p-7">
          {warning && <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">{warning}</div>}
          {card ? (
            <div key={card.id} className="dialer-in flex flex-col">
              <CompanyPanel card={card} mode={init.scope.mode} me={init.me} copied={copied} onCopy={copy} draft={draft} onDraft={(v) => setDraft(card.id, v)} onSendNote={sendNote} composerRef={composerRef} onShowRegistry={() => setRegistryOpen(true)} onScanDone={() => refreshCard(card.id)} onNotice={say} outcome={<CallPanel form={form} onChange={patch} onClear={() => setForm(EMPTY)} onChangeOutcome={() => setMenuOpen(true)} meetingRef={meetingRef} />} />
            </div>
          ) : (
            <div className="space-y-4" aria-busy="true" aria-label="Laddar företaget">
              <div className="h-6 w-1/3 animate-pulse rounded-full bg-[#F4F4F1]" /><div className="h-10 w-2/3 animate-pulse rounded-2xl bg-[#F4F4F1]" /><div className="h-14 w-full animate-pulse rounded-2xl bg-[#F4F4F1]" /><div className="h-32 animate-pulse rounded-2xl bg-[#F4F4F1]" />
            </div>
          )}
        </div>
      )}

      {/* Alltid inom räckhåll: sparat/ångra, spara och knapparna för att gå vidare. Fäst längst ned i det rullande området. */}
      {!done && (
        <div className="sticky bottom-0 z-30 -mx-1 flex flex-col gap-2 bg-gradient-to-t from-[#F4F4F1] from-70% to-transparent px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-4">
          {toast && <div aria-live="polite"><ToastView toast={toast} onUndo={undo} onClose={() => setToast(null)} className="shadow-lg" /></div>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(index - 1, "back")} disabled={index === 0} aria-label="Förra företaget" title="Förra (←)" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm disabled:opacity-40"><ChevronLeft size={20} /></button>

            {/* Delad knapp: huvuddelen sparar (eller öppnar menyn när inget utfall är valt), pilen öppnar menyn med utfall och Hoppa över. */}
            <div className="relative flex h-14 min-w-0 flex-1">
              {menuOpen && <OutcomeMenu selected={form.outcome} onPick={choose} onSkip={() => { setMenuOpen(false); go(index + 1, "fwd"); }} onClose={() => setMenuOpen(false)} />}
              <button
                type="button"
                disabled={!card}
                onClick={() => (canSave ? submit() : setMenuOpen((o) => !o))}
                title={canSave ? "Enter sparar. ⌘ Enter sparar även från anteckningen." : undefined}
                className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-l-full px-5 text-[16px] font-semibold text-white shadow-sm transition-colors disabled:opacity-40 ${canSave ? "bg-[#F26522]" : "bg-[#14161F]"}`}
              >
                {canSave ? <Check size={18} className="shrink-0" /> : <ClipboardCheck size={18} className="shrink-0" />}
                <span className="truncate">{!card ? "Laddar…" : !form.outcome ? "Logga samtal" : !canSave ? "Ange mötets tid" : `Spara: ${outcomeLabel(form.outcome)}`}</span>
              </button>
              <button
                type="button"
                disabled={!card}
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Välj hur samtalet gick, eller hoppa över"
                className={`flex w-12 shrink-0 items-center justify-center rounded-r-full border-l border-white/25 text-white shadow-sm disabled:opacity-40 ${canSave ? "bg-[#F26522]" : "bg-[#14161F]"}`}
              >
                <ChevronDown size={18} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {filtersOpen && <FilterSheet init={init} here={here} onClose={() => setFiltersOpen(false)} />}
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      {registryOpen && card && <RegistryDialog companyId={card.id} name={card.name} onClose={() => setRegistryOpen(false)} onOrgnrSaved={() => refreshCard(card.id)} />}
    </div>
  );
}
