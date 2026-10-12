import Link from "next/link";

const TONES = {
  green: "bg-emerald-100 text-emerald-800",
  gray: "bg-gray-100 text-gray-600",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  orange: "bg-accent-tint text-accent-text",
  dark: "bg-ink text-white",
} as const;

export function StatusPill({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONES[tone]}`}>{children}</span>;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-3xl bg-white px-6 py-14 text-center">
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-[14px] text-gray-500">{text}</p>}
      {action && <Link href={action.href} className="mt-5 inline-block rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-white">{action.label}</Link>}
    </div>
  );
}

/** Bekräftelse eller fel efter en åtgärd. Båda kommer via adressen (?ok=... / ?error=...). */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className={`mb-5 rounded-2xl px-5 py-3 text-[13px] ${error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{error ?? ok}</p>
  );
}

export function Pagination({ basePath, params, next }: { basePath: string; params: Record<string, string | undefined>; next: string | null }) {
  if (!next) return null;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  p.set("cursor", next);
  return (
    <div className="mt-4 flex justify-center">
      <Link href={`${basePath}?${p.toString()}`} className="rounded-full border border-gray-300 bg-white px-5 py-2 text-[13px] font-medium hover:border-gray-500">Visa äldre</Link>
    </div>
  );
}
