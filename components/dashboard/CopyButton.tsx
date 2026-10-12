"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyButton({ text, label = "Kopiera länk" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
      className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium hover:border-gray-500"
    >
      {done ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
      {done ? "Kopierad" : label}
    </button>
  );
}
