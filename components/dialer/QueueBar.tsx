"use client";

import Link from "next/link";
import { CircleHelp, RefreshCw, SlidersHorizontal } from "lucide-react";
import { dialerHref, type QueueMode } from "@/lib/dialer/scope";
import type { DialerInit } from "./types";

const MODES: { mode: QueueMode; label: string }[] = [
  { mode: "new", label: "Att ringa" },
  { mode: "callbacks", label: "Återkomster" },
  { mode: "mine", label: "Mina" },
];

/** Överst i ringläget: vilken kö, ett filter, och hur mycket som är kvar. Själva filtren ligger i ett blad. */
export default function QueueBar({ init, callsToday, left, onHelp, onRefresh, refreshing, onFilters }: {
  init: DialerInit; callsToday: number; left: number; onHelp: () => void; onRefresh: () => void; refreshing: boolean; onFilters: () => void;
}) {
  const { scope } = init;
  const filtered = !!scope.profileSlug || !!scope.city;
  const sourceName = scope.profileSlug ? init.suppliers.find((s) => s.slug === scope.profileSlug)?.name : null;

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
          <span className="font-semibold text-ink">{left}{init.capped ? "+" : ""}</span> kvar · <span className="font-semibold text-ink">{callsToday}</span> ringda idag
          {(sourceName || scope.city) && <span className="text-gray-400"> · {[sourceName, scope.city].filter(Boolean).join(", ")}</span>}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onRefresh} title="Uppdatera kön" aria-label="Uppdatera kön" className="rounded-full p-2 text-gray-500 hover:bg-white"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /></button>
          <button onClick={onHelp} title="Tangentbordsgenvägar (?)" aria-label="Tangentbordsgenvägar" className="hidden rounded-full p-2 text-gray-500 hover:bg-white [@media(pointer:fine)]:block"><CircleHelp size={17} /></button>
        </div>
      </div>
    </div>
  );
}
