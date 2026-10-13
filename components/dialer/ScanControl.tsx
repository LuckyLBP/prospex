"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ScanSearch, Star } from "@/components/brand/icons";
import Sheet from "./Sheet";
import { STAGE_LABEL } from "@/lib/profile/stages";
import type { Candidate } from "@/lib/profile/name-search";
import type { DialerCard } from "@/lib/dialer/card-types";
import { profileProgressAction, scanCompanyAction, searchCompaniesAction } from "@/app/app/spaning/actions";

const POLL_MS = 1500;
const BTN = "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Picker = { state: "loading" } | { state: "ready"; candidates: Candidate[] } | { state: "error"; text: string };

/**
 * "Spana på företaget" i ringläget. Spanar på just det här företaget, så att resultatet hamnar på kortet. Saknar
 * företaget webbplats och org.nr i katalogen får den som ringer välja företaget bland sökträffar på namnet.
 * Medan en spaning pågår visas steget; när den är klar hämtas kortet på nytt.
 */
export default function ScanControl({ card, onDone, onNotice }: { card: DialerCard; onDone: () => void; onNotice: (kind: "info" | "error", text: string) => void }) {
  const p = card.profile;
  const [buildId, setBuildId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const done = useRef(onDone);
  const notice = useRef(onNotice);
  done.current = onDone;
  notice.current = onNotice;

  const runningId = buildId ?? (p && (p.status === "running" || p.status === "queued") ? p.id : null);

  useEffect(() => {
    if (!runningId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let r: Awaited<ReturnType<typeof profileProgressAction>> = null;
      let failed = false;
      try { r = await profileProgressAction(runningId); } catch { failed = true; /* ett missat svar provas igen */ }
      if (stop) return;
      if (!failed && r === null) { setBuildId(null); notice.current("error", "Spaningen hittades inte."); return; }
      if (r && r.status === "done") { setBuildId(null); done.current(); return; }
      if (r && r.status === "error") { setBuildId(null); notice.current("error", r.error ?? "Spaningen misslyckades."); done.current(); return; }
      if (r) setStage(r.stage ? STAGE_LABEL[r.stage] : "I kö");
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, 600);
    return () => { stop = true; clearTimeout(timer); };
  }, [runningId]);

  async function start(pick?: { buildFrom: string | null }) {
    setStarting(true);
    try {
      const r = await scanCompanyAction(card.id, pick);
      if (!r.ok) {
        if (r.needsSearch) await openPicker();
        else notice.current("error", r.error);
        return;
      }
      setPicker(null);
      if (r.reused) done.current();
      else { setStage("I kö"); setBuildId(r.id); }
    } catch {
      notice.current("error", "Kunde inte starta spaningen. Försök igen.");
    } finally {
      setStarting(false);
    }
  }

  async function openPicker() {
    setPicker({ state: "loading" });
    try {
      const r = await searchCompaniesAction([card.name, card.city].filter(Boolean).join(" "));
      setPicker(r.ok ? { state: "ready", candidates: r.candidates } : { state: "error", text: r.error });
    } catch {
      setPicker({ state: "error", text: "Sökningen misslyckades." });
    }
  }

  if (runningId) {
    return <span className={`${BTN} cursor-default border-accent-tint bg-accent-wash text-accent-text`} role="status"><Loader2 size={15} className="animate-spin" />{stage ?? "Spanar"}…</span>;
  }
  if (p?.status === "done") return null;

  return (
    <>
      <button type="button" onClick={() => start()} disabled={starting} className={`${BTN} border-gray-200 bg-white text-ink hover:border-gray-400 disabled:opacity-60`}>
        {starting ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} className="text-accent" />}
        {p?.status === "error" ? "Försök spana igen" : "Spana på företaget"}
      </button>

      {picker && (
        <Sheet title="Vilket företag är det?" onClose={() => setPicker(null)}>
          <p className="mb-3 text-[13px] text-gray-500">Katalogen saknar webbplats och organisationsnummer för {card.name ?? "företaget"}. Välj rätt träff så spanar vi på den.</p>
          {picker.state === "loading" && <p className="flex items-center gap-2 py-6 text-[14px] text-gray-500"><Loader2 size={16} className="animate-spin" />Söker…</p>}
          {picker.state === "error" && <p className="py-4 text-[14px] text-rose-700">{picker.text}</p>}
          {picker.state === "ready" && picker.candidates.length === 0 && <p className="py-4 text-[14px] text-gray-500">Inga träffar på namnet.</p>}
          {picker.state === "ready" && picker.candidates.length > 0 && (
            <ul className="flex flex-col gap-2">
              {picker.candidates.map((c) => (
                <li key={c.key}>
                  <button type="button" disabled={!c.buildFrom || starting} onClick={() => start({ buildFrom: c.buildFrom })} className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 p-3 text-left hover:border-gray-400 disabled:opacity-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">{c.name}</span>
                      <span className="block truncate text-[12px] text-gray-500">{[c.city, c.domain ?? c.orgnr ?? "ingen webbplats eller org.nr"].filter(Boolean).join(" · ")}</span>
                    </span>
                    {c.rating != null && <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-gray-500"><Star size={12} className="fill-amber-400 text-amber-400" />{c.rating.toLocaleString("sv-SE", { minimumFractionDigits: 1 })}</span>}
                    <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-gray-600">{c.source === "katalog" ? "Katalog" : "Google"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </>
  );
}
