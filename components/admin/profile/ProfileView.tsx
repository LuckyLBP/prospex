import { StatusPill } from "@/components/admin/bits";
import { ratioPercent, titleCasePlace } from "@/lib/profile/format";
import type { PresenceItem } from "@/lib/profile/presence";
import { techCount, techGroups } from "@/lib/profile/tech-view";
import type { CompanyProfile, PageLog, ServiceItem } from "@/lib/profile/types";
import FinanceHistory from "./FinanceHistory";
import PeopleCard from "./PeopleCard";
import KpiStrip from "./KpiStrip";
import ProfileHero from "./ProfileHero";
import SidePanel, { type AgencyState } from "./SidePanel";
import TechGrid from "./TechGrid";
import { Bar, Card, ClaimText, ConfidenceMeter, Evidence, Label, Muted } from "./parts";

const kr = (n: number | null) => (n === null ? "saknas" : `${Math.round(n).toLocaleString("sv-SE")} kr`);
const SITE_STATUS: Record<string, string> = { ok: "Hämtad", none: "Ingen webbplats känd", blocked: "Släppte inte in oss", unreachable: "Svarade inte", mismatch: "Hör troligen till ett annat företag" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 py-1.5 text-[14px]"><dt className="w-36 shrink-0 text-gray-500">{label}</dt><dd className="min-w-0 flex-1 text-gray-900">{children}</dd></div>;
}

/**
 * Profilsidan som en instrumentpanel: företagskort och nyckeltal överst, huvudspalt med verksamhet, samtalspunkter,
 * ekonomi, teknik och tjänster, och en sidopanel med byrå, kopplingar och kontakt. Äldre profiler saknar de nya
 * fälten och visas utan dem.
 */
export default function ProfileView({ profile, pages, presence, fallbackName, actions, agency, returnTo, profileId, photoUrls, tenant = false }: { profile: CompanyProfile; pages: PageLog[]; presence: PresenceItem[]; fallbackName: string; actions?: React.ReactNode; agency?: AgencyState | null; returnTo?: string; profileId?: string; photoUrls?: Record<string, string>; /** Bolagets vy: utan källor, kopplingar till vår katalog och adminverktyg. */ tenant?: boolean }) {
  const facts = new Map(profile.facts.map((f) => [f.id, f]));
  const reg = profile.registry;
  const org = reg.organisation;
  const figures = reg.figures;
  const groups = techGroups(profile);
  const talking = profile.talkingPoints ?? [];
  const links = profile.platformLinks ?? [];
  const sources = tenant ? links.length : presence.length + links.length;
  const solidity = figures ? (figures.solidity !== null ? Math.round(figures.solidity) : ratioPercent(figures.equity, figures.totalAssets)) : null;
  const margin = figures ? ratioPercent(figures.profit, figures.revenue) : null;

  return (
    <div className="group/pv flex flex-col gap-5" data-viewer={tenant ? "tenant" : "admin"}>
      <ProfileHero profile={profile} fallbackName={fallbackName} actions={actions} />
      <KpiStrip profile={profile} techTotal={techCount(groups)} sources={sources} presenceCount={presence.length} hideSources={tenant} />

      {!tenant && profile.meta.warnings.length > 0 && (
        <ul className="rounded-2xl bg-amber-50 px-5 py-3 text-[13px] text-amber-900">{profile.meta.warnings.map((w) => <li key={w} className="py-0.5">{w}</li>)}</ul>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {(profile.overview.offering.length > 0 || profile.overview.audience) && (
            <Card title="Verksamhet">
              <div className="flex flex-col gap-4">
                {profile.overview.offering.length > 0 && (
                  <div><Label>Vad de erbjuder</Label>
                    <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{profile.overview.offering.map((c, i) => <li key={i} className="rounded-2xl bg-[#F4F4F1] px-4 py-3 text-[14px] leading-snug text-gray-800"><ClaimText claim={c} facts={facts} /></li>)}</ul></div>
                )}
                {profile.overview.audience && (
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl border border-gray-100 px-4 py-3 text-[14px]"><span className="text-[13px] font-medium text-gray-500">Säljer till</span><ClaimText claim={profile.overview.audience} facts={facts} /></div>
                )}
              </div>
            </Card>
          )}

          {(profileId || tenant) && <PeopleCard people={profile.contact.people ?? []} profileId={profileId} photoUrls={photoUrls} readOnly={tenant} />}

          {talking.length > 0 && (
            <Card title="Samtalspunkter" tone="warm" note="Förslag på ingångar, byggda på belägg">
              <ol className="flex flex-col gap-3">
                {talking.map((c, i) => (
                  <li key={i} className="flex gap-3.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F26522] text-[12px] font-semibold text-white">{i + 1}</span><span className="pt-0.5 text-[14px] leading-snug text-[#14161F]"><ClaimText claim={c} facts={facts} /></span></li>
                ))}
              </ol>
            </Card>
          )}

          <Card title="Bolag och ekonomi" note={reg.status === "ok" ? "Källa: Bolagsverket" : undefined}>
            {reg.status !== "ok" || !org ? <Muted>{reg.message ?? "Inga uppgifter från Bolagsverket."}</Muted> : (
              <div className="flex flex-col gap-5">
                {figures ? (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                    <Bar label="Soliditet" value={solidity} display={solidity === null ? "saknas" : `${solidity} %`} hint={figures.solidity === null && solidity !== null ? "Beräknad: eget kapital i förhållande till tillgångarna" : "Eget kapital i förhållande till tillgångarna"} />
                    <Bar label="Resultat av omsättningen" value={margin === null ? null : Math.max(0, margin)} display={margin === null ? "saknas" : `${margin} %`} />
                    <div className="md:col-span-2"><FinanceHistory figures={figures} /></div>
                    <p className="text-[12px] text-gray-400 md:col-span-2">Räkenskapsår som slutar {figures.periodEnd}. Omsättning {kr(figures.revenue)}, resultat {kr(figures.profit)}, eget kapital {kr(figures.equity)}, tillgångar {kr(figures.totalAssets)}.</p>
                  </div>
                ) : (
                  <Muted>{reg.figuresStatus === "none_digital" ? "Bolagsverkets API har ingen årsredovisning för företaget, så siffrorna saknas. Det gäller ofta stora och börsnoterade bolag." : reg.figuresStatus === "not_applicable" ? "Enskilda firmor lämnar ingen årsredovisning." : "Årsredovisningen har inte hämtats."}</Muted>
                )}
                <dl className="divide-y divide-gray-50 border-t border-gray-100 pt-3">
                  {org.sni.length > 0 && <Row label="Bransch (SNI)">{org.sni.slice(0, 3).map((s) => `${s.code} ${s.label}`).join(", ")}</Row>}
                  {profile.contact.address && <Row label="Adress">{titleCasePlace(profile.contact.address)}</Row>}
                  {org.description && <Row label="Verksamhet enligt bolaget">{org.description}</Row>}
                </dl>
              </div>
            )}
          </Card>

          {profile.jobs && profile.jobs.ads.length > 0 && (
            <Card title="Rekryterar" note={`${profile.jobs.total} ${profile.jobs.total === 1 ? "öppen annons" : "öppna annonser"} · Arbetsförmedlingen`}>
              <ul className="divide-y divide-gray-50">
                {profile.jobs.ads.map((ad) => (
                  <li key={ad.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-[14px]">
                    <a href={ad.url} target="_blank" rel="noreferrer" className="min-w-0 font-medium text-[#14161F] hover:underline">{ad.title}</a>
                    <span className="text-[12px] text-gray-400">{[ad.city, ad.published ? `publicerad ${ad.published}` : null].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Teknik och spår" note={SITE_STATUS[profile.website.status]}>
            {profile.website.status !== "ok" && groups.length === 0 ? <Muted>{profile.website.message ?? "Ingen webbplats att läsa."}</Muted> : <TechGrid groups={groups} audit={profile.website.audit} />}
          </Card>

          <Card title="Tjänster de kan ha köpt" note="Sådant som setts, inte vad företaget betalar">
            {profile.services.length === 0 ? <Muted>Inga tjänster kunde beläggas.</Muted> : (
              <ul className="divide-y divide-gray-50">
                {profile.services.map((s: ServiceItem) => (
                  <li key={`${s.name}-${s.category}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 py-3 text-[14px]">
                    <span className="w-full shrink-0 font-medium sm:w-52 text-[#14161F]">{s.name}{s.origin === "ai" && <span className="ml-2 align-middle"><StatusPill>AI</StatusPill></span>}</span>
                    <span className="w-24 shrink-0"><StatusPill>{s.category.charAt(0).toUpperCase() + s.category.slice(1)}</StatusPill></span>
                    <span className="w-24 shrink-0"><ConfidenceMeter level={s.confidence} /></span>
                    <span className="min-w-0 flex-1 text-gray-600">{s.basis}<Evidence ids={s.evidence} facts={facts} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {profile.observations.length > 0 && (
            <Card title="Observationer">
              <ul className="flex flex-col gap-2 text-[14px] text-gray-800">{profile.observations.map((c, i) => <li key={i} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F26522]" /><ClaimText claim={c} facts={facts} /></li>)}</ul>
            </Card>
          )}
        </div>

        <SidePanel profile={profile} presence={tenant ? [] : presence} agency={tenant ? null : agency} returnTo={returnTo} tenant={tenant} />
      </div>

      {!tenant && <details className="rounded-3xl bg-white p-6" id="kallor">
        <summary className="cursor-pointer text-[16px] font-semibold text-[#14161F]">Källor ({profile.facts.length} belägg, {pages.length} sidor)</summary>
        <div className="mt-4 flex flex-col gap-5">
          <ul className="divide-y divide-gray-50 text-[13px]">
            {profile.facts.map((f) => (
              <li key={f.id} id={`fakta-${f.id}`} className="flex flex-wrap gap-x-3 py-2 target:bg-[#FFF6F0]">
                <span className="w-10 shrink-0 font-medium text-gray-400">{f.id}</span>
                <span className="w-56 shrink-0 text-gray-800">{f.label}</span>
                <span className="min-w-0 flex-1 text-gray-700">{f.value}{f.match && <span className="block truncate text-[12px] text-gray-400" title={f.match}>Träff: {f.match}</span>}</span>
                <span className="max-w-[260px] truncate text-gray-400" title={f.source}>{/^https?:/.test(f.source) ? <a href={f.source} target="_blank" rel="noreferrer" className="hover:underline">{f.source}</a> : f.source}</span>
              </li>
            ))}
          </ul>
          {pages.length > 0 && (
            <div><Label>Hämtade sidor</Label>
              <ul className="text-[13px] text-gray-600">{pages.map((p, i) => <li key={i} className="py-0.5">{p.status || "ingen kontakt"} {p.url} <span className="text-gray-400">({p.via === "model" ? "vald av AI" : "kod"}{p.problem ? `, ${p.problem}` : ""})</span></li>)}</ul></div>
          )}
        </div>
      </details>}
    </div>
  );
}
