"use client";

import { useState } from "react";
import { Check, Copy } from "@/components/brand/icons";

/** Ett skrivskyddat fält med en kopieraknapp, till exempel kalenderlänken. */
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* markera texten och kopiera för hand */ }
  }
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-canvas px-4 text-[13px] text-gray-700 outline-none" />
      <button type="button" onClick={copy} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-gray-300 bg-white px-5 text-[14px] font-medium text-ink hover:border-gray-500">
        {copied ? <><Check size={16} className="text-success" />Kopierad</> : <><Copy size={16} />Kopiera</>}
      </button>
    </div>
  );
}
