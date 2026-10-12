import type { Claim, Fact } from "@/lib/profile/types";

// Små delar som profilens kort delar: kort, källetiketter, staplar och en säkerhetsmätare.

export function Card({ id, title, note, tone = "white", children, className = "" }: { id?: string; title?: string; note?: React.ReactNode; tone?: "white" | "warm"; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`rounded-3xl p-6 ${tone === "warm" ? "bg-[#FFF6F0] ring-1 ring-[#FFE3D2]" : "bg-white"} ${className}`}>
      {title && (
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-[16px] font-semibold text-[#14161F]">{title}</h2>
          {note && <p className="text-right text-[12px] text-gray-400">{note}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-[14px] text-gray-500">{children}</p>;
export const Label = ({ children }: { children: React.ReactNode }) => <p className="mb-2 text-[13px] font-medium text-gray-500">{children}</p>;

/** Källetiketter för ett påstående. Titeln visar vad beläget är och varifrån det kommer, och leder till Källor. */
export function Evidence({ ids, facts }: { ids: string[]; facts: Map<string, Fact> }) {
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const f = facts.get(id);
        return (
          <a key={id} href={`#fakta-${id}`} title={f ? `${f.label}: ${f.value} (${f.source})` : id} className="rounded-md bg-black/5 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-[#FFE3D2] hover:text-[#C2490C]">{id}</a>
        );
      })}
    </span>
  );
}

export function ClaimText({ claim, facts }: { claim: Claim; facts: Map<string, Fact> }) {
  return <span>{claim.text}<Evidence ids={claim.evidence} facts={facts} /></span>;
}

/** En vågrät stapel med etikett och värde, i samma stil som startsidans. `value` är 0 till 100. */
export function Bar({ label, value, display, hint }: { label: string; value: number | null; display: string; hint?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-gray-600">{label}</span>
        <span className={`font-semibold ${value === null ? "text-gray-400" : "text-[#14161F]"}`}>{display}</span>
      </div>
      <div className="h-2 rounded-full bg-[#F4F4F1]" role="img" aria-label={`${label}: ${display}`}><div className="h-2 rounded-full bg-[#F26522]" style={{ width: `${pct}%` }} /></div>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

const LEVEL = { stark: 3, trolig: 2, svag: 1 } as const;
const LEVEL_TEXT = { stark: "Stark", trolig: "Trolig", svag: "Svag" } as const;

/** Tre små streck som visar hur säkert något är. */
export function ConfidenceMeter({ level }: { level: keyof typeof LEVEL }) {
  const n = LEVEL[level];
  return (
    <span className="inline-flex items-center gap-1.5" title={`Säkerhet: ${LEVEL_TEXT[level]}`}>
      <span className="flex gap-0.5" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className={`h-3 w-1.5 rounded-sm ${i <= n ? "bg-[#F26522]" : "bg-gray-200"}`} />)}</span>
      <span className="text-[12px] text-gray-600">{LEVEL_TEXT[level]}</span>
    </span>
  );
}
