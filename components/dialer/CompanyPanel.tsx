import { ArrowUpRight, Building2, Check, Copy, Globe, Mail, MapPin, Phone, TriangleAlert } from "lucide-react";
import OutcomePill from "@/components/dashboard/OutcomePill";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import Chat from "./Chat";
import ProfileBlock from "./ProfileBlock";
import ScanControl from "./ScanControl";
import { formatDateTime } from "@/lib/time";
import { formatSwedishPhone } from "@/lib/enrich/phone";
import { signalNote } from "@/lib/signal-note";
import type { DialerCard } from "@/lib/dialer/card-types";

const when = (iso: string) => formatDateTime(new Date(iso));

// Knapparna på kortet: stora nog att träffa med tummen, och samma form överallt.
const SHAPE = "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const PILL = `${SHAPE} border-gray-200 bg-white text-ink hover:border-gray-400`;

function Kbd({ children }: { children: React.ReactNode }) {
  // Tangenttips visas bara där det finns ett tangentbord.
  return <kbd className="hidden rounded bg-black/[0.06] px-1.5 text-[11px] font-medium text-gray-500 [@media(pointer:fine)]:inline">{children}</kbd>;
}

/** Sektionerna är platta: bara en linje emellan, utom samtalspunkterna som får en ljus ton eftersom de är det viktigaste. */
function Section({ title, badge, tone = "plain", children }: { title: string; badge?: React.ReactNode; tone?: "plain" | "warm"; children: React.ReactNode }) {
  return (
    <section className={tone === "warm" ? "rounded-2xl bg-accent-wash p-4 ring-1 ring-accent/15" : "border-t border-gray-100 pt-4"}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {badge}
      </div>
      <div className="text-[14px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function Dot({ hot }: { hot: boolean }) {
  return <span className={`mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full ${hot ? "bg-accent" : "bg-gray-400"}`} />;
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
    ...s.seo.map((x) => ({ key: x.label, hot: false, node: <><span className="font-medium text-ink">{x.label}.</span> {x.detail}</> })),
  ];
  const SHOW = 3;
  const row = (i: (typeof all)[number]) => (
    <li key={i.key} className={`flex items-start gap-2 ${i.hot ? "font-medium text-ink" : ""}`}><Dot hot={i.hot} /><span>{i.node}</span></li>
  );

  return (
    <Section title="Samtalspunkter" tone="warm" badge={s.outdated ? <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-ink">Föråldrad webbplats</span> : undefined}>
      {all.length === 0 ? (
        <p className="flex items-center gap-2"><Check size={16} className="text-emerald-600" /> Inget uppenbart att ta upp på webbplatsen.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">{all.slice(0, SHOW).map(row)}</ul>
          {all.length > SHOW && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[13px] font-medium text-accent-text hover:underline">Visa {all.length - SHOW} till</summary>
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
    <section className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold text-ink">Om bolaget</h3>
        <p className="truncate text-[13px] text-gray-500">{summary || card.orgnr || "Organisationsnummer saknas"}</p>
      </div>
      <button type="button" onClick={onShow} onMouseDown={(e) => e.preventDefault()} className={PILL}>
        <Building2 size={15} />Företagsuppgifter <Kbd>I</Kbd>
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
  draft: string;
  onDraft: (v: string) => void;
  onSendNote: () => void;
  composerRef: React.RefObject<HTMLTextAreaElement>;
  onShowRegistry: () => void;
  /** Skanningen är klar eller ändrad: hämta kortet på nytt. */
  onScanDone: () => void;
  onNotice: (kind: "info" | "error", text: string) => void;
  /** Utfallsformuläret ("Hur gick samtalet?"), som ligger under knapparna så att det alltid syns på sidan. */
  outcome?: React.ReactNode;
};

const MAX_SOURCES = 3;

export default function CompanyPanel({ card, mode, me, copied, onCopy, draft, onDraft, onSendNote, composerRef, onShowRegistry, onScanDone, onNotice, outcome }: Props) {
  const r = card.registry;
  const c = card.contact;
  const suppliers = [...new Map(card.signals.map((s) => [s.supplier, s])).values()];
  const chat = <Chat card={card} me={me} draft={draft} onDraft={onDraft} onSend={onSendNote} composerRef={composerRef} />;
  const website = card.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const points = <CallPoints card={card} />;
  const profile = card.profile?.status === "done" ? <ProfileBlock profile={card.profile} /> : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {suppliers.slice(0, MAX_SOURCES).map((s) => (
          <span key={s.supplier} className="inline-flex items-center gap-1.5 rounded-full bg-canvas py-0.5 pl-1 pr-2.5 text-[12px] font-medium text-gray-700">
            <SupplierLogo name={s.supplier} logo={s.logo} size={20} fallback={s.kind === "list" ? <CategoryIcon icon={s.icon} size={12} /> : undefined} />
            {s.supplier}
            {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer" aria-label={`Källa för ${s.supplier}`} className="text-accent"><ArrowUpRight size={12} /></a>}
          </span>
        ))}
        {suppliers.length > MAX_SOURCES && <span className="text-[12px] text-gray-400">+{suppliers.length - MAX_SOURCES}</span>}
        {c?.archived && <span className="rounded-full bg-gray-200 px-3 py-1 text-[12px] font-medium text-gray-700">Arkiverad</span>}
        {c?.outcome && !c.archived && (
          <span className="inline-flex items-center gap-2 text-[12px] text-gray-500">
            <OutcomePill outcome={c.outcome} />
            {c.lastCalledAt && when(c.lastCalledAt)}{c.lastCalledByEmail && <> · {c.lastCalledByEmail}</>}
          </span>
        )}
      </div>

      <div>
        <h2 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[32px]">{card.name ?? "Okänt företag"}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-500">
          {card.city && <span className="inline-flex items-center gap-1"><MapPin size={14} />{card.city}</span>}
          {r?.active === true && <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={14} />Aktivt bolag</span>}
          {r?.active === false && <span className="inline-flex items-center gap-1 font-medium text-rose-700"><TriangleAlert size={14} />Avregistrerat bolag</span>}
          {r && r.proceedings > 0 && <span className="inline-flex items-center gap-1 font-medium text-amber-700"><TriangleAlert size={14} />{r.proceedings} pågående ärende{r.proceedings === 1 ? "" : "n"}</span>}
          {r?.advertisingBlocked && <span className="inline-flex items-center gap-1 font-medium text-amber-700"><TriangleAlert size={14} />Reklamspärr</span>}
        </div>
      </div>

      {card.phone ? (
        <div className="flex gap-2">
          <a href={`tel:${card.phone}`} className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-ink px-4 text-[17px] font-semibold text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Phone size={18} className="text-accent" />{formatSwedishPhone(card.phone)} <Kbd>V</Kbd>
          </a>
          <button type="button" onClick={onCopy} onMouseDown={(e) => e.preventDefault()} title="Kopiera numret (C)" aria-label="Kopiera numret" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 hover:border-gray-400">
            {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
          </button>
        </div>
      ) : (
        <p className="rounded-2xl bg-canvas px-4 py-3.5 text-[14px] text-gray-500">Inget telefonnummer.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {card.email && <a href={`mailto:${card.email}`} className={PILL}><Mail size={15} />Mejla</a>}
        {card.website && <a href={card.website} target="_blank" rel="noreferrer" className={PILL}><Globe size={15} />{website}</a>}
        {card.canScan && <ScanControl card={card} onDone={onScanDone} onNotice={onNotice} />}
      </div>

      {outcome}

      {mode === "callbacks" ? <>{chat}{points}{profile}</> : <>{points}{profile}{chat}</>}
      <AboutCompany card={card} onShow={onShowRegistry} />
      <p className="text-[12px] text-gray-500">{signalNote(card.signals)}</p>
    </div>
  );
}
