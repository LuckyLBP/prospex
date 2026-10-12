"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Database, Globe, Loader2, MapPin, Search, Star } from "lucide-react";
import { STAGE_LABEL, STAGE_ORDER, type ProfileStage } from "@/lib/profile/stages";
import * as adminActions from "@/app/admin/foretagsprofil/actions";
import type { ProfileProgress, StartResult } from "@/app/admin/foretagsprofil/actions";
import { kindOf } from "@/lib/profile/input-kind";
import type { Candidate } from "@/lib/profile/name-search";

// Sökfältet överst på Företagsprofil: ett stort fält med glöd i fokus, en markering av vad som skrivits
// (org.nr eller webbadress) och en rund sökknapp. När en profil byggs stannar man kvar här: fältet låses och
// förloppet visas under det, och när bygget är klart går man vidare till profilen. Tolkningen av texten är bara
// en ledtråd, servern avgör (lib/profile/input.ts).

/** Åtgärderna sökfältet anropar. Admin använder de egna, bolag får egna med åtkomstkontroll. */
export type SearchActions = {
  create: (raw: string) => Promise<StartResult>;
  progress: (id: string) => Promise<ProfileProgress | null>;
  search: (query: string) => Promise<{ ok: true; candidates: Candidate[] } | { ok: false; error: string }>;
};
const ADMIN_ACTIONS: SearchActions = { create: adminActions.createProfileAction, progress: adminActions.profileProgressAction, search: adminActions.searchCompaniesAction };

const EXAMPLES = ["ikea.se", "556677-8899"];
const POLL_MS = 1200;

type Phase = { kind: "idle" } | { kind: "searching" } | { kind: "choosing"; candidates: Candidate[] } | { kind: "starting" } | { kind: "building"; id: string; progress: ProfileProgress | null } | { kind: "done"; id: string };

function Steps({ stage, done }: { stage: ProfileStage | null; done: boolean }) {
  const at = done ? STAGE_ORDER.length : stage ? STAGE_ORDER.indexOf(stage) : -1;
  return (
    <div className="mt-6" aria-live="polite">
      <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={STAGE_ORDER.length} aria-valuenow={Math.max(0, at)}>
        {STAGE_ORDER.map((s, i) => (
          <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div className={`h-full rounded-full bg-gradient-to-r from-accent to-amber-400 transition-all duration-700 ${i < at ? "w-full" : i === at ? "w-1/2 animate-pulse" : "w-0"}`} />
          </div>
        ))}
      </div>
      <ol className="mt-4 flex flex-col items-center gap-1 text-center">
        <li className="flex items-center gap-2 text-[15px] font-medium text-ink">
          {done ? <Check size={16} className="text-emerald-600" /> : <Loader2 size={16} className="animate-spin text-accent" />}
          {done ? "Klar, öppnar profilen" : stage ? `${STAGE_LABEL[stage]}…` : "Köar…"}
        </li>
        <li className="text-[12px] text-gray-400">{done ? " " : `Steg ${Math.max(1, at + 1)} av ${STAGE_ORDER.length} · tar oftast 5 till 30 sekunder`}</li>
      </ol>
    </div>
  );
}

export default function ProfileSearch({ actions = ADMIN_ACTIONS, basePath = "/admin/foretagsprofil" }: { actions?: SearchActions; basePath?: string } = {}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  const busy = phase.kind !== "idle" && phase.kind !== "choosing";
  const kind = kindOf(value);
  const buildId = phase.kind === "building" ? phase.id : null;

  // Följer bygget tills det är klart eller har misslyckats.
  useEffect(() => {
    if (!buildId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let p: ProfileProgress | null = null;
      let failed = false;
      try { p = await actions.progress(buildId); } catch { failed = true; /* ett missat svar provas igen */ }
      if (stop) return;
      if (!failed && p === null) {
        setError("Profilen hittades inte.");
        setPhase({ kind: "idle" });
        return;
      }
      if (p?.status === "done") {
        setPhase({ kind: "done", id: buildId });
        return;
      }
      if (p?.status === "error") {
        setError(p?.error ?? "Bygget misslyckades.");
        setPhase({ kind: "idle" });
        return;
      }
      if (p) setPhase((cur) => (cur.kind === "building" && cur.id === buildId ? { kind: "building", id: buildId, progress: p } : cur));
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [buildId, router]);

  // Öppnar profilen strax efter att den blivit klar. Egen effekt, så att den inte avbryts när bygget slutar följas.
  const doneId = phase.kind === "done" ? phase.id : null;
  useEffect(() => {
    if (!doneId) return;
    const t = setTimeout(() => router.push(`${basePath}/${doneId}`), 700);
    return () => clearTimeout(t);
  }, [doneId, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setError(null);
    // Ett namn leder till en lista att välja ur, en webbadress eller ett org.nr bygger direkt.
    if (kindOf(value) === "name") {
      setPhase({ kind: "searching" });
      try {
        const r = await actions.search(value);
        if (!r.ok) { setError(r.error); setPhase({ kind: "idle" }); return; }
        setPhase({ kind: "choosing", candidates: r.candidates });
      } catch {
        setError("Sökningen gick inte att göra just nu. Försök igen.");
        setPhase({ kind: "idle" });
      }
      return;
    }
    await start(value);
  }

  async function start(raw: string) {
    setError(null);
    setPhase({ kind: "starting" });
    try {
      const r = await actions.create(raw);
      if (!r.ok) { setError(r.error); setPhase({ kind: "idle" }); return; }
      setPhase({ kind: "building", id: r.id, progress: null });
    } catch {
      setError("Något gick fel när profilen skulle startas. Försök igen.");
      setPhase({ kind: "idle" });
    }
  }

  const progress = phase.kind === "building" ? phase.progress : null;
  const shown = phase.kind === "building" || phase.kind === "done";

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-[60vh] w-full max-w-[720px] flex-col justify-center pb-10">
      <h2 className="mb-2 text-center text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[34px]">
        {shown ? (progress?.name ?? "Bygger profilen") : "Vilket företag vill du titta på?"}
      </h2>
      <p className="mx-auto mb-7 max-w-[520px] text-center text-[14px] text-gray-500">
        {shown ? "Vi läser webbplatsen och hämtar uppgifter från Bolagsverket." : "Skriv ett företagsnamn, en webbadress eller ett organisationsnummer. Vi läser sajten och hämtar uppgifter från Bolagsverket."}
      </p>

      <div className="group relative">
        <div aria-hidden className={`profile-glow pointer-events-none absolute -inset-1.5 rounded-full bg-gradient-to-r from-accent via-amber-300 to-rose-400 blur-xl transition-opacity duration-500 ${busy ? "opacity-70" : "opacity-20 group-focus-within:opacity-70"}`} />
        <div className={`relative flex h-16 items-center gap-3 overflow-hidden rounded-full border bg-white pl-5 pr-2 shadow-[0_8px_30px_-12px_rgb(14_17_22/0.25)] transition-colors group-focus-within:border-accent ${busy ? "border-accent" : "border-gray-200"}`}>
          <Search size={20} className={`shrink-0 transition-colors group-focus-within:text-accent ${busy ? "text-accent" : "text-gray-400"}`} />
          <input
            ref={ref}
            name="input"
            value={value}
            onChange={(e) => { setValue(e.target.value); if (phase.kind === "choosing") setPhase({ kind: "idle" }); }}
            readOnly={busy}
            autoFocus
            // Webbläsarverktyg (och lösenordshanterare) lägger till attribut på fältet innan React hunnit ta över.
            suppressHydrationWarning
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="Företagsnamn, foretag.se eller 556677-8899"
            aria-label="Webbadress eller organisationsnummer"
            className={`min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-gray-400 ${busy ? "text-gray-500" : "text-ink"}`}
          />
          <span className={`hidden shrink-0 rounded-full bg-accent-tint px-2.5 py-1 text-[12px] font-medium text-accent-text transition-opacity duration-200 sm:inline ${kind && !busy ? "opacity-100" : "opacity-0"}`}>
            {kind === "orgnr" ? "Org.nr" : kind === "url" ? "Webbadress" : kind === "name" ? "Företagsnamn" : ""}
          </span>
          <button
            disabled={!value.trim() || busy}
            aria-label="Skapa profil"
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-white transition-all hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 sm:px-6"
          >
            {busy ? <><Loader2 size={17} className="animate-spin" /><span className="hidden sm:inline">{phase.kind === "searching" ? "Söker…" : "Läser…"}</span></> : <><span className="hidden sm:inline">Sök</span><ArrowRight size={17} /></>}
          </button>
          {busy && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden"><span className="profile-shimmer block h-full w-2/5 bg-gradient-to-r from-transparent via-accent to-transparent" /></span>}
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-5 py-3 text-center text-[13px] text-rose-800">{error}</p>}

      {phase.kind === "choosing" && (
        <div className="mt-5">
          {phase.candidates.length === 0 ? (
            <p className="rounded-2xl bg-white px-5 py-4 text-center text-[14px] text-gray-500">Hittade inget företag med det namnet. Prova med webbadress eller organisationsnummer.</p>
          ) : (
            <>
              <p className="mb-2 text-center text-[13px] text-gray-500">Välj företaget du menar</p>
              <ul className="flex flex-col gap-2">
                {phase.candidates.map((c) => (
                  <li key={c.key}>
                    <button type="button" disabled={!c.buildFrom} onClick={() => start(c.buildFrom!)} className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left transition-colors hover:bg-accent-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-gray-500">{c.source === "katalog" ? <Database size={16} /> : <Globe size={16} />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-ink">{c.name}</span>
                        <span className="flex flex-wrap items-center gap-x-3 text-[12px] text-gray-500">
                          {c.city && <span className="inline-flex items-center gap-1"><MapPin size={12} />{c.city}</span>}
                          {c.domain && <span>{c.domain}</span>}
                          {c.rating !== null && <span className="inline-flex items-center gap-1"><Star size={12} className="text-accent" />{c.rating.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>}
                          {!c.buildFrom && <span className="text-amber-700">Ingen webbplats hittades, ange webbadress eller org.nr</span>}
                        </span>
                      </span>
                      {c.source === "katalog" && <span className="shrink-0 rounded-full bg-accent-tint px-2.5 py-1 text-[12px] font-medium text-accent-text">Finns i katalogen</span>}
                      <ArrowRight size={16} className="shrink-0 text-gray-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {shown ? (
        <>
          <Steps stage={progress?.stage ?? null} done={phase.kind === "done"} />
          {phase.kind === "building" && (
            <p className="mt-5 text-center text-[12px] text-gray-400">
              Du kan lämna sidan, bygget fortsätter. <button type="button" onClick={() => { setPhase({ kind: "idle" }); setValue(""); }} className="underline underline-offset-4 hover:text-ink">Sluta vänta</button>
            </p>
          )}
        </>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[13px] text-gray-400">
          <span>Prova</span>
          {EXAMPLES.map((e) => (
            <button key={e} type="button" disabled={busy} onClick={() => { setValue(e); ref.current?.focus(); }} className="rounded-full bg-white px-3 py-1 text-gray-600 transition-colors hover:bg-accent-tint hover:text-accent-text">{e}</button>
          ))}
        </div>
      )}
    </form>
  );
}
