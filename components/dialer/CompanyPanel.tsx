import { ArrowUpRight, Building2, Check, Copy, Globe, Mail, MapPin, Phone, TriangleAlert } from "lucide-react";
import OutcomePill from "@/components/dashboard/OutcomePill";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import Chat from "./Chat";
import { formatDateTime } from "@/lib/time";
import { formatSwedishPhone } from "@/lib/enrich/phone";
import { signalNote } from "@/lib/signal-note";
import type { DialerCard } from "@/lib/dialer/card-types";

const when = (iso: string) => formatDateTime(new Date(iso));

// Alla knappar på kortet har samma höjd och form.
const SHAPE = "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F26522]";
const PILL = `${SHAPE} border-gray-300 bg-white text-[#14161F] hover:border-gray-500`;
const PILL_DARK = `${SHAPE} border-[#14161F] bg-[#14161F] text-white hover:bg-black`;
const PILL_OFF = "inline-flex h-10 w-10 shrink-0 cursor-default items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400";

function Kbd({ children, on }: { children: React.ReactNode; on?: boolean }) {
  return <kbd className={`rounded px-1.5 text-[11px] font-medium ${on ? "bg-white/20" : "bg-black/[0.06] text-gray-500"}`}>{children}</kbd>;
}

/** Alla sektioner delar mått och typsnitt, så kortet är lugnt att läsa. */
function Section({ title, badge, tone = "plain", children }: { title: string; badge?: React.ReactNode; tone?: "plain" | "warm"; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl p-4 ${tone === "warm" ? "bg-[#FFF6F0] ring-1 ring-[#F26522]/15" : "bg-[#F7F7F4]"}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-[#14161F]">{title}</h3>
        {badge}
      </div>
      <div className="text-[14px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function Dot({ hot }: { hot: boolean }) {
  return <span className={`mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full ${hot ? "bg-[#F26522]" : "bg-gray-400"}`} />;
}

function CallPoints({ card }: { card: DialerCard }) {
  const s = card.site;
  if (!card.website) return <Section title="Samtalspunkter"><p>Företaget har ingen känd webbplats. Det kan vara en öppning i sig.</p></Section>;
  if (!s.analysed) return <Section title="Samtalspunkter"><p className="text-gray-500">Ingen webbplatsanalys än.</p></Section>;

  const reasons = s.issues.filter((i) => i.outdated);
  const notes = s.issues.filter((i) => !i.outdated);
  const all = [
    ...reasons.map((i) => ({ key: i.label, hot: true, node: <>{i.label}</> })),
    ...notes.map((i) => ({ key: i.label, hot: false, node: <>{i.label}</> })),
    ...s.seo.map((x) => ({ key: x.label, hot: false, node: <><span className="font-medium text-[#14161F]">{x.label}.</span> {x.detail}</> })),
  ];
  const SHOW = 3;
  const row = (i: (typeof all)[number]) => (
    <li key={i.key} className={`flex items-start gap-2 ${i.hot ? "font-medium text-[#14161F]" : ""}`}><Dot hot={i.hot} /><span>{i.node}</span></li>
  );

  return (
    <Section title="Samtalspunkter" tone="warm" badge={s.outdated ? <span className="rounded-full bg-[#F26522] px-2.5 py-0.5 text-[11px] font-semibold text-white">Föråldrad webbplats</span> : undefined}>
      {all.length === 0 ? (
        <p className="flex items-center gap-2"><Check size={16} className="text-emerald-600" /> Inget uppenbart att ta upp på webbplatsen.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">{all.slice(0, SHOW).map(row)}</ul>
          {all.length > SHOW && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[13px] font-medium text-[#F26522] hover:underline">Visa {all.length - SHOW} till</summary>
              <ul className="mt-1.5 flex flex-col gap-1.5">{all.slice(SHOW).map(row)}</ul>
            </details>
          )}
        </>
      )}
      {s.facts.length > 0 && <p className="mt-2 text-[13px] text-gray-500">{s.facts.join(" · ")}</p>}
    </Section>
  );
}

/** En rad om bolaget med knappen som öppnar företagsuppgifterna från Bolagsverket. */
function AboutCompany({ card, onShow }: { card: DialerCard; onShow: () => void }) {
  const r = card.registry;
  const summary = [r?.sni, r?.legalForm, r?.registeredYear ? `registrerat ${r.registeredYear}` : null].filter(Boolean).join(" · ");
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F7F7F4] p-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold text-[#14161F]">Om bolaget</h3>
        <p className="truncate text-[13px] text-gray-500">{summary || card.orgnr || "Organisationsnummer saknas"}</p>
      </div>
      <button type="button" onClick={onShow} onMouseDown={(e) => e.preventDefault()} className={PILL}>
        <Building2 size={15} />Visa företagsuppgifter <Kbd>I</Kbd>
      </button>
    </section>
  );
}

type Props = {
  card: DialerCard;
  /** Köläge. I "callbacks" ligger tråden före samtalspunkterna, eftersom man då ringer upp ett samtal. */
  mode: string;
  me: string;
  copied: boolean;
  onCopy: () => void;
  revealed: boolean;
  onReveal: () => void;
  draft: string;
  onDraft: (v: string) => void;
  onSendNote: () => void;
  composerRef: React.RefObject<HTMLTextAreaElement>;
  onShowRegistry: () => void;
};

export default function CompanyPanel({ card, mode, me, copied, onCopy, revealed, onReveal, draft, onDraft, onSendNote, composerRef, onShowRegistry }: Props) {
  const r = card.registry;
  const c = card.contact;
  const suppliers = [...new Map(card.signals.map((s) => [s.supplier, s])).values()];
  const chat = <Chat card={card} me={me} draft={draft} onDraft={onDraft} onSend={onSendNote} composerRef={composerRef} />;
  const website = card.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {suppliers.map((s) => (
          <span key={s.supplier} className="inline-flex items-center gap-2 rounded-full bg-[#F4F4F1] py-1 pl-1.5 pr-3 text-[12px] font-medium text-gray-800">
            <SupplierLogo name={s.supplier} logo={s.logo} size={24} fallback={s.kind === "list" ? <CategoryIcon icon={s.icon} size={13} /> : undefined} />
            {s.supplier}
            {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer" aria-label={`Källa för ${s.supplier}`} className="text-[#F26522]"><ArrowUpRight size={13} /></a>}
          </span>
        ))}
        {c?.archived && <span className="rounded-full bg-gray-200 px-3 py-1 text-[12px] font-medium text-gray-700">Arkiverad</span>}
        {c?.outcome && !c.archived && (
          <span className="inline-flex items-center gap-2 text-[12px] text-gray-500">
            <OutcomePill outcome={c.outcome} />
            {c.lastCalledAt && when(c.lastCalledAt)}{c.lastCalledByEmail && <> · {c.lastCalledByEmail}</>}
          </span>
        )}
      </div>

      <div>
        <h2 className="text-[clamp(1.5rem,2.3vw,2.1rem)] font-semibold leading-[1.12] tracking-[-0.025em] text-[#14161F]">{card.name ?? "Okänt företag"}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-500">
          {card.city && <span className="inline-flex items-center gap-1"><MapPin size={14} />{card.city}</span>}
          {r?.active === true && <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={14} />Aktivt bolag</span>}
          {r?.active === false && <span className="inline-flex items-center gap-1 font-medium text-rose-700"><TriangleAlert size={14} />Avregistrerat bolag</span>}
          {r && r.proceedings > 0 && <span className="inline-flex items-center gap-1 font-medium text-amber-700"><TriangleAlert size={14} />{r.proceedings} pågående ärende{r.proceedings === 1 ? "" : "n"}</span>}
          {r?.advertisingBlocked && <span className="inline-flex items-center gap-1 font-medium text-amber-700"><TriangleAlert size={14} />Reklamspärr</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!card.phone ? (
          <span className={PILL_OFF} title="Inget nummer" aria-label="Inget nummer"><Phone size={15} /></span>
        ) : revealed ? (
          <>
            <a href={`tel:${card.phone}`} className={PILL_DARK}>
              <Phone size={15} className="text-[#F26522]" />{formatSwedishPhone(card.phone)}
            </a>
            <button type="button" onClick={onCopy} onMouseDown={(e) => e.preventDefault()} title="Kopiera numret (C)" aria-label="Kopiera numret" className={`${PILL} !px-3`}>
              {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              {copied && "Kopierad"}
            </button>
          </>
        ) : (
          <button type="button" onClick={onReveal} onMouseDown={(e) => e.preventDefault()} className={PILL}>
            <Phone size={15} />Visa nummer <Kbd>V</Kbd>
          </button>
        )}
        {card.email ? <a href={`mailto:${card.email}`} className={PILL}><Mail size={15} />Mejla</a> : <span className={PILL_OFF} title="Ingen e-post" aria-label="Ingen e-post"><Mail size={15} /></span>}
        {card.website ? <a href={card.website} target="_blank" rel="noreferrer" className={PILL}><Globe size={15} />{website}</a> : <span className={PILL_OFF} title="Ingen webbplats" aria-label="Ingen webbplats"><Globe size={15} /></span>}
      </div>

      {mode === "callbacks" ? (
        <>
          {chat}
          <CallPoints card={card} />
        </>
      ) : (
        <>
          <CallPoints card={card} />
          {chat}
        </>
      )}
      <AboutCompany card={card} onShow={onShowRegistry} />
      <p className="text-[12px] text-gray-500">{signalNote(card.signals)}</p>
    </div>
  );
}
