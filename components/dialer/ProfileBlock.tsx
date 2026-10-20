import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone, Star, TrendingDown, TrendingUp } from "@/components/brand/icons";
import { compactKr, sv } from "@/lib/profile/format";
import { formatSwedishPhone } from "@/lib/enrich/phone";
import { formatDateTime } from "@/lib/time";
import type { CardProfile } from "@/lib/dialer/card-types";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
const CHIP = "inline-flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-[12px] font-medium text-gray-700";
const NETWORK: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", x: "X" };

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[12px] font-medium text-gray-500">{title}</p>{children}</div>;
}

/** Det en spaning hittat om företaget. Det viktigaste för ett samtal först; resten under "Mer om företaget". */
export default function ProfileBlock({ profile: p }: { profile: CardProfile }) {
  const f = p.figures;
  const age = p.founded ? new Date().getFullYear() - p.founded : null;
  const chips = [
    p.rating ? <span key="r" className={CHIP}><Star size={12} className="fill-amber-400 text-amber-400" />{p.rating.value.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{p.rating.count ? ` (${sv(p.rating.count)} omdömen)` : ""}</span> : null,
    f?.employees != null ? <span key="e" className={CHIP}>{sv(f.employees)} anställda</span> : null,
    f?.revenue != null ? <span key="v" className={CHIP}>Omsättning {compactKr(f.revenue)}{f.year ? ` (${f.year})` : ""}</span> : null,
    p.growth !== null ? <span key="g" className={`${CHIP} ${p.growth >= 0 ? "!bg-emerald-50 !text-emerald-800" : "!bg-rose-50 !text-rose-800"}`}>{p.growth >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{p.growth > 0 ? "+" : ""}{p.growth} % mot året före</span> : null,
    f?.profit != null ? <span key="p" className={CHIP}>Resultat {compactKr(f.profit)}</span> : null,
    age !== null && age >= 0 ? <span key="a" className={CHIP}>{age === 0 ? "Bildat i år" : `${age} år sedan bildat`}</span> : null,
  ].filter(Boolean);
  const more = p.offering.length > 0 || !!p.audience || p.tech.length > 0 || p.hours.length > 0 || !!p.address || p.social.length > 0 || !!p.builtBy;

  return (
    <section className="flex flex-col gap-4 border-t border-gray-100 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">Spaning</h3>
        {p.finishedAt && <span className="text-[12px] text-gray-400">{formatDateTime(new Date(p.finishedAt))}</span>}
      </div>

      {p.summary && <p className="text-[14px] leading-relaxed text-gray-700">{p.summary}</p>}

      {chips.length > 0 && <div className="flex flex-wrap gap-1.5">{chips}</div>}

      {p.talkingPoints.length > 0 && (
        <div className="rounded-2xl bg-accent-wash p-4 ring-1 ring-accent/15">
          <p className="mb-2 text-[13px] font-semibold text-ink">Att ta upp i samtalet</p>
          <ul className="flex flex-col gap-1.5 text-[14px] leading-snug text-gray-800">
            {p.talkingPoints.map((t) => <li key={t} className="flex gap-2"><span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{t}</li>)}
          </ul>
        </div>
      )}

      {p.jobs && (
        <Sub title={`Rekryterar: ${p.jobs.total} ${p.jobs.total === 1 ? "öppen annons" : "öppna annonser"}`}>
          <ul className="flex flex-col gap-1 text-[13px]">
            {p.jobs.ads.map((a) => (
              <li key={a.url}><a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gray-800 underline-offset-4 hover:underline">{a.title}{a.city ? <span className="text-gray-400"> · {a.city}</span> : null}<ArrowUpRight size={12} className="text-gray-400" /></a></li>
            ))}
          </ul>
        </Sub>
      )}

      {p.people.length > 0 ? (
        <Sub title="Kontaktpersoner">
          <ul className="flex flex-col gap-2">
            {p.people.map((x) => (
              <li key={x.key} className="flex items-center gap-3 rounded-2xl bg-canvas p-2.5">
                {x.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.photoUrl} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full bg-white object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[14px] font-semibold text-gray-400" aria-hidden>{initials(x.name)}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{x.name}</p>
                  {x.role && <p className="truncate text-[12px] text-gray-500">{x.role}</p>}
                  {x.phone && <p className="truncate text-[12px] text-gray-500">{formatSwedishPhone(x.phone) ?? x.phone}</p>}
                </div>
                {x.phone && <a href={`tel:${x.phone}`} aria-label={`Ring ${x.name}`} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-white"><Phone size={14} className="text-accent" />Ring {x.name.split(" ")[0]}</a>}
                {x.email && !x.phone && <a href={`mailto:${x.email}`} aria-label={`Mejla ${x.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700"><Mail size={15} /></a>}
              </li>
            ))}
          </ul>
        </Sub>
      ) : (
        <p className="text-[13px] text-gray-500">Inga kontaktpersoner hittades på webbplatsen.</p>
      )}

      {more && (
        <details className="group rounded-2xl border border-gray-100 p-4">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            Mer om företaget <span className="ml-1 text-gray-400 group-open:hidden">▾</span><span className="ml-1 hidden text-gray-400 group-open:inline">▴</span>
          </summary>
          <div className="mt-3 flex flex-col gap-4 text-[13px] text-gray-700">
            {p.offering.length > 0 && (
              <Sub title="Vad de erbjuder">
                <ul className="flex flex-col gap-1">{p.offering.map((o) => <li key={o} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-400" />{o}</li>)}</ul>
              </Sub>
            )}
            {p.audience && <Sub title="Säljer till"><p>{p.audience}</p></Sub>}
            {p.tech.length > 0 && <Sub title="Teknik på webbplatsen"><div className="flex flex-wrap gap-1.5">{p.tech.map((t) => <span key={t.name} className={CHIP} title={t.category || undefined}>{t.name}</span>)}</div></Sub>}
            {p.hours.length > 0 && <Sub title="Öppettider"><ul className="text-gray-600">{p.hours.map((h) => <li key={h}>{h}</li>)}</ul></Sub>}
            {p.address && (
              <Sub title="Adress">
                <p className="flex items-start gap-1.5"><MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />{p.address}{p.mapsUrl && <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="ml-1 shrink-0 text-accent-text underline underline-offset-4">Karta</a>}</p>
              </Sub>
            )}
            {p.social.length > 0 && <Sub title="Sociala kanaler"><div className="flex flex-wrap gap-1.5">{p.social.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className={`${CHIP} hover:bg-gray-200`}>{NETWORK[s.network] ?? s.network}<ArrowUpRight size={11} className="text-gray-400" /></a>)}</div></Sub>}
            {p.builtBy && <Sub title="Webbplatsen byggd av"><p>{p.builtBy}</p></Sub>}
          </div>
        </details>
      )}

      <Link href={`/app/spaning/${p.id}`} className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-accent-text underline underline-offset-4">Öppna hela spaningen<ArrowUpRight size={13} /></Link>
    </section>
  );
}
