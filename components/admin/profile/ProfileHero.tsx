import { Building2, CalendarDays, Globe, MapPin } from "@/components/brand/icons";
import { StatusPill } from "@/components/admin/bits";
import SupplierLogo from "@/components/ui/SupplierLogo";
import type { CompanyProfile } from "@/lib/profile/types";
import { titleCasePlace, yearsSince } from "@/lib/profile/format";
import { companyStatus } from "@/lib/bolagsverket/types";

/** Företagskortet överst: logotyp, namn, status, grunduppgifter och AI:ns sammanfattning som en kort ingress. */
export default function ProfileHero({ profile, fallbackName, actions }: { profile: CompanyProfile; fallbackName: string; actions?: React.ReactNode }) {
  const org = profile.registry.organisation;
  const name = profile.company.name ?? fallbackName;
  const status = org ? companyStatus({ ...org, otherNames: [], address: null, unavailable: [] } as never) : null;
  const city = titleCasePlace(org?.address?.city);

  const meta: { icon: React.ReactNode; text: React.ReactNode }[] = [];
  if (profile.company.orgnr) meta.push({ icon: <Building2 size={14} />, text: profile.company.orgnr });
  if (city) meta.push({ icon: <MapPin size={14} />, text: city });
  if (profile.company.website) meta.push({ icon: <Globe size={14} />, text: <a href={profile.company.website} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{profile.company.domain}</a> });

  if (org?.registeredAt) {
    const age = yearsSince(org.registeredAt);
    meta.push({ icon: <CalendarDays size={14} />, text: `Registrerat ${org.registeredAt}${age !== null ? ` · ${age} år sedan` : ""}` });
  }

  return (
    <section className="rounded-3xl bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-5">
          <SupplierLogo name={name} logo={profile.companyLogoPath ?? undefined} size={40} className="!h-[72px] !w-[72px] !rounded-2xl !text-[24px]" />
          <div className="min-w-0">
            <h1 className="break-words text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">{name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {org?.legalForm && <StatusPill>{org.legalForm.label}</StatusPill>}
              {status?.kind === "active" && <StatusPill tone="green">Verksamt</StatusPill>}
              {status?.kind === "inactive" && <StatusPill tone="amber">Inte verksamt</StatusPill>}
              {status?.kind === "deregistered" && <StatusPill tone="red">Avregistrerat</StatusPill>}
              {status?.kind === "proceeding" && <StatusPill tone="red">{status.label}</StatusPill>}
              {profile.company.soleTrader && <StatusPill tone="orange">Enskild firma</StatusPill>}
              {profile.company.websiteSource === "places" && !profile.company.websiteVerified && <StatusPill tone="amber">Webbplatsen är inte bekräftad</StatusPill>}
            </div>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {meta.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-gray-600">
          {meta.map((m, i) => <li key={i} className="flex items-center gap-1.5"><span className="text-gray-400">{m.icon}</span>{m.text}</li>)}
        </ul>
      )}

      <p className={`mt-5 border-t border-gray-100 pt-4 text-[15px] leading-relaxed ${profile.overview.summary ? "text-ink" : "text-gray-400"}`}>
        {profile.overview.summary ?? "Ingen sammanfattning. Det kan bero på att AI inte är konfigurerat eller att det inte fanns något att sammanfatta."}
      </p>
    </section>
  );
}
