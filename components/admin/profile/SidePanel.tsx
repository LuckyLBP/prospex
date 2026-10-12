import Link from "next/link";
import { ArrowUpRight, ChevronDown, Clock, Mail, MapPin, Phone } from "lucide-react";
import { StatusPill } from "@/components/admin/bits";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import { resolveCreator, sameAgency } from "@/lib/profile/creator-view";
import { retryAgencyRunAction, setCreditKindAction } from "@/app/admin/foretagsprofil/actions";
import { shortDate } from "@/lib/profile/format";
import { presenceDisclaimer, type PresenceItem } from "@/lib/profile/presence";
import type { CompanyProfile } from "@/lib/profile/types";
import BrandIcon from "./BrandIcon";
import { Card, Evidence, Label, Muted } from "./parts";

const sourceHref = (slug: string, kind: "supplier" | "list") => `/admin/${kind === "list" ? "listor" : "leverantorer"}/${slug}`;

export type AgencyState = { id: string; slug: string; published: boolean; customers: number; profiling: boolean; lastRun: { status: string; error: string | null; note: string | null } | null };

export default function SidePanel({ profile, presence, agency, returnTo, tenant = false }: { profile: CompanyProfile; presence: PresenceItem[]; agency?: AgencyState | null; returnTo?: string; /** Bolagets vy: ingen uppgift om hur vi hittat något, inga kataloglänkar och inga adminverktyg. */ tenant?: boolean }) {
  const creator = resolveCreator(profile);
  const facts = new Map(profile.facts.map((f) => [f.id, f]));
  const builder = creator ? presence.find((p) => p.kind === "supplier" && sameAgency(creator.name, p)) ?? null : null;
  const creatorSlug = creator?.supplierSlug ?? builder?.slug ?? null;
  const creatorLogo = creator?.logoPath ?? builder?.logoPath ?? null;
  const links = profile.platformLinks ?? [];
  const c0 = profile.contact;
  // Telefonnummer och adresser som hör till en person visas på personen, inte en gång till här.
  const owned = { phones: new Set((c0.people ?? []).map((p) => p.phone).filter(Boolean)), emails: new Set((c0.people ?? []).map((p) => p.email).filter(Boolean)) };
  const c = { ...c0, phones: c0.phones.filter((p) => !owned.phones.has(p)), emails: c0.emails.filter((e) => !owned.emails.has(e)) };
  const disclaimer = presenceDisclaimer(presence);

  return (
    <aside className="flex flex-col gap-5 lg:sticky lg:top-0 lg:self-start">
      <Card title="Skapad av">
        {creator ? (
          <div className="flex items-center gap-3.5">
            <SupplierLogo name={creator.name} logo={creatorLogo ?? undefined} size={40} className="!h-14 !w-14 !rounded-2xl" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink">{creator.name}{!tenant && <Evidence ids={creator.evidence} facts={facts} />}</p>
              {!tenant && creator.basis === "same-server" && <p className="text-[12px] text-gray-400">Samma server som byråns kunder</p>}
              {!tenant && creator.basis === "agency-source" && <p className="text-[12px] text-gray-400">Finns i byråns kundlista</p>}
              {creator.url && <a href={creator.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-gray-500 hover:text-ink">{creator.domain ?? creator.url}<ArrowUpRight size={12} /></a>}
              {!tenant && creatorSlug && <p className="mt-1"><Link href={sourceHref(creatorSlug, "supplier")} className="text-[12px] font-medium text-accent-text underline underline-offset-4">Finns i vår katalog</Link></p>}
            </div>
          </div>
        ) : <Muted>Ingen byrå anges på webbplatsen.</Muted>}
        {!tenant && creator && agency && (
          <div className="mt-4 flex flex-col gap-1.5 border-t border-gray-100 pt-3 text-[13px] text-gray-500">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {agency.profiling && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />Byrån profileras</span>}
              {agency.profiling && <span aria-hidden>·</span>}
              <Link href={sourceHref(agency.slug, "supplier")} className="font-medium text-accent-text underline underline-offset-4">
                {agency.customers > 0 ? `${agency.customers} ${agency.customers === 1 ? "kund" : "kunder"} funna${agency.published ? "" : ", ej publicerade"}` : "Inga kunder funna än"}
              </Link>
            </p>
            {agency.lastRun?.status === "error" && (
              <div className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800">
                <p>Insamlingen misslyckades: {agency.lastRun.error ?? "okänt fel"}</p>
                <form action={retryAgencyRunAction} className="mt-1.5">
                  <input type="hidden" name="supplier_id" value={agency.id} /><input type="hidden" name="return_to" value={returnTo ?? ""} />
                  <button className="font-medium underline underline-offset-4">Försök igen</button>
                </form>
              </div>
            )}
            {agency.lastRun?.status !== "error" && agency.lastRun?.note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">{agency.lastRun.note}</p>}
          </div>
        )}
        {!tenant && creator && creator.domain && (
          <details className="group mt-3 text-[12px] text-gray-400">
            <summary className="cursor-pointer list-none underline-offset-4 hover:text-gray-600 hover:underline [&::-webkit-details-marker]:hidden">Fel byrå?</summary>
            <form action={setCreditKindAction} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="domain" value={creator.domain} /><input type="hidden" name="name" value={creator.name} /><input type="hidden" name="return_to" value={returnTo ?? ""} />
              <button name="kind" value="platform" className="rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:border-gray-400">Det är en plattform</button>
              <button name="kind" value="not-agency" className="rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:border-gray-400">Det är ingen byrå</button>
            </form>
          </details>
        )}
      </Card>

      {!tenant && <Card title="Finns även hos" note={presence.length > 0 ? `${presence.length} ${presence.length === 1 ? "källa" : "källor"}` : undefined}>
        {presence.length === 0 ? <Muted>Företaget finns inte hos någon av våra källor än.</Muted> : (
          <ul className="flex flex-col gap-3">
            {presence.map((p) => (
              <li key={p.slug} className="flex items-center gap-3">
                <SupplierLogo name={p.name} logo={p.logoPath ?? undefined} size={32} fallback={p.kind === "list" ? <CategoryIcon icon={null} size={16} /> : undefined} />
                <div className="min-w-0 flex-1">
                  <Link href={sourceHref(p.slug, p.kind)} className="flex items-center gap-2 truncate text-[14px] font-medium text-ink hover:underline">{p.name}{!p.published && <StatusPill tone="amber">Opublicerad</StatusPill>}</Link>
                  <p className="truncate text-[12px] text-gray-400">{[p.kind === "list" ? (p.category ?? "Lista") : p.slug === builder?.slug ? "Byggde webbplatsen" : "Källa", shortDate(p.firstSeen) ? `hittad ${shortDate(p.firstSeen)}` : null].filter(Boolean).join(" · ")}</p>
                </div>
                {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Öppna företagets sida hos ${p.name}`} className="rounded-full p-1.5 text-gray-400 hover:bg-canvas hover:text-ink"><ArrowUpRight size={15} /></a>}
              </li>
            ))}
          </ul>
        )}
        {disclaimer && <p className="mt-4 text-[12px] text-gray-400">{disclaimer}</p>}
      </Card>}

      {links.length > 0 && (
        <Card title="Webbplatsen länkar till">
          <ul className="flex flex-col gap-2.5">
            {links.map((l) => (
              <li key={l.domain} className="flex items-center gap-3">
                <BrandIcon name={l.name} size={28} />
                <div className="min-w-0 flex-1"><a href={l.url} target="_blank" rel="noreferrer" className="block truncate text-[14px] font-medium text-ink hover:underline">{l.name}</a><p className="text-[12px] text-gray-400">{l.kind}</p></div>
                {l.supplierSlug && <Link href={sourceHref(l.supplierSlug, "supplier")}><StatusPill tone="orange">Källa hos oss</StatusPill></Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={(c0.people?.length ?? 0) > 0 ? "Övriga kontaktuppgifter" : "Kontakt"}>
        {c.phones.length + c.emails.length === 0 && !c.address && !c.place ? <Muted>Inga kontaktuppgifter hittades.</Muted> : (
          <ul className="flex flex-col gap-2 text-[14px]">
            {c.phones.map((p) => <li key={p}><a href={`tel:${p}`} className="flex items-center gap-2.5 rounded-xl bg-canvas px-3 py-2 text-ink hover:bg-gray-200"><Phone size={15} className="text-accent" />{p}</a></li>)}
            {c.emails.map((e) => <li key={e}><a href={`mailto:${e}`} className="flex items-center gap-2.5 rounded-xl bg-canvas px-3 py-2 text-ink hover:bg-gray-200"><Mail size={15} className="text-accent" /><span className="truncate">{e}</span></a></li>)}
            {c.address && <li className="flex items-start gap-2.5 px-1 text-gray-700"><MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />{c.address}</li>}
            {c.place && (
              <li className="px-1 text-[13px] text-gray-500">
                Google: {[c.place.name, c.place.address].filter(Boolean).join(", ")}{c.place.mapsUrl && <a href={c.place.mapsUrl} target="_blank" rel="noreferrer" className="ml-1.5 underline underline-offset-4">Karta</a>}
                {c.place.category && <span className="mt-1.5 block"><StatusPill>{c.place.category}</StatusPill></span>}
                {c.place.hours && c.place.hours.length > 0 && (
                  <details className="group mt-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-ink [&::-webkit-details-marker]:hidden"><Clock size={14} className="text-gray-400" />Öppettider<ChevronDown size={14} className="text-gray-400 transition-transform group-open:rotate-180" /></summary>
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-gray-500">{c.place.hours.map((h) => <li key={h}>{h}</li>)}</ul>
                  </details>
                )}
              </li>
            )}
          </ul>
        )}
        {profile.marketing.social.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <Label>Sociala medier</Label>
            <ul className="flex flex-wrap gap-2">{profile.marketing.social.map((s) => <li key={s.network}><a href={s.url} target="_blank" rel="noreferrer" title={s.network} className="flex items-center gap-2 rounded-full border border-gray-100 py-1 pl-1 pr-3 text-[13px] capitalize text-gray-700 hover:bg-canvas"><BrandIcon name={s.network} size={24} />{s.network}</a></li>)}</ul>
          </div>
        )}
      </Card>
    </aside>
  );
}
