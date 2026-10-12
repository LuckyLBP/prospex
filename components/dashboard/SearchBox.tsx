"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Result = { id: string; name: string | null; phone: string | null; orgnr: string | null; city: string | null; suppliers: string | null };

export default function SearchBox() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (res.ok) setResults(((await res.json()) as { results: Result[] }).results);
      } catch { /* avbruten */ }
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  return (
    <div className="relative hidden md:block">
      <form
        onSubmit={(e) => { e.preventDefault(); if (q.trim()) { setOpen(false); router.push(`/app/bygg-lista?q=${encodeURIComponent(q.trim())}`); } }}
        className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5"
      >
        <Search size={15} className="text-gray-400" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Sök företag, nummer, org.nr"
          className="w-56 bg-transparent text-[14px] outline-none"
        />
        <kbd className="rounded bg-gray-100 px-1.5 text-[11px] text-gray-500">⌘K</kbd>
      </form>
      {open && results.length > 0 && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[380px] overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
          {results.map((r) => (
            <Link key={r.id} href={`/app/foretag/${r.id}`} onClick={() => setOpen(false)} className="block px-4 py-2.5 hover:bg-[#F4F4F1]">
              <span className="block truncate text-[14px] font-medium text-[#14161F]">{r.name ?? "Okänt företag"}</span>
              <span className="block truncate text-[12px] text-gray-500">{[r.phone, r.city, r.suppliers].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
