"use client";

import Link from "next/link";
import { CircleHelp, RefreshCw, SlidersHorizontal } from "@/components/brand/icons";
import { dialerHref, templateLabel, type QueueMode } from "@/lib/dialer/scope";
import type { DialerInit } from "./types";

const MODES: { mode: QueueMode; label: string }[] = [
  { mode: "new", label: "Att ringa" },
  { mode: "callbacks", label: "Återkomster" },
  { mode: "mine", label: "Mina" },
];

/** Överst i ringläget: vilken kö, ett filter, och hur mycket som är kvar. Själva filtren ligger i ett blad. */
export default function QueueBar({ init, progress, callsToday, left, onHelp, onRefresh, refreshing, onFilters }: {
  init: DialerInit; /** Var man är i den sparade listan. Null i Återkomster och Mina. */ progress: { done: number; total: number } | null; callsToday: number; left: number; onHelp: () => void; onRefresh: () => void; refreshing: boolean; onFilters: () => void;
}) {
  const { scope } = init;
  const filtered = scope.sources.length > 0 || !!scope.city || !!scope.template;
  const names = scope.sources.map((slug) => init.suppliers.find((s) => s.slug === slug)?.name ?? slug);
  const sourceName = names.length === 0 ? null : names.length <= 2 ? names.join(", ") : `${names.length} källor`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 rounded-full bg-white p-1">
          {MODES.map(({ mode, label }) => (
            <Link key={mode} href={dialerHref({ ...scope, mode })} aria-current={scope.mode === mode ? "page" : undefined} className={`flex-1 truncate rounded-full px-2 py-2 text-center text-[13px] font-medium ${scope.mode === mode ? "bg-ink text-white" : "text-gray-700 hover:bg-canvas"}`}>
              {label}
            </Link>
          ))}
        </div>
        <button type="button" onClick={onFilters} aria-label="Filter" className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 hover:bg-gray-50 ${filtered ? "ring-2 ring-accent" : ""}`}>
          <SlidersHorizontal size={17} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-2 text-[13px] text-gray-600">
        <p className="min-w-0 truncate">
          {progress ? (
            <><span className="font-semibold text-ink">{templateLabel(scope.template)}</span> · <span className="tabular font-semibold text-ink">{Math.min(progress.done + 1, progress.total)}</span> av <span className="tabular">{progress.total}{init.capped ? "+" : ""}</span></>
          ) : (
            <><span className="font-semibold text-ink">{left}{init.capped ? "+" : ""}</span> kvar</>
          )}
          {" · "}<span className="font-semibold text-ink">{callsToday}</span> ringda idag
          {(sourceName || scope.city) && <span className="text-gray-400"> · {[sourceName, scope.city].filter(Boolean).join(", ")}</span>}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onRefresh} title={progress ? "Ny lista" : "Uppdatera kön"} aria-label={progress ? "Ny lista" : "Uppdatera kön"} className="rounded-full p-2 text-gray-500 hover:bg-white"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /></button>
          <button onClick={onHelp} title="Tangentbordsgenvägar (?)" aria-label="Tangentbordsgenvägar" className="hidden rounded-full p-2 text-gray-500 hover:bg-white [@media(pointer:fine)]:block"><CircleHelp size={17} /></button>
        </div>
      </div>
    </div>
  );
}
