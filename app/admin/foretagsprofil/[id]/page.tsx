import Link from "next/link";
import { notFound } from "next/navigation";
import { RotateCw } from "@/components/brand/icons";
import { ChevronLeft } from "@/components/brand/icons";
import ProfileView from "@/components/admin/profile/ProfileView";
import RunPoller from "@/components/admin/RunPoller";
import { Flash, StatusPill } from "@/components/admin/bits";
import { btnPrimary, btnSecondary } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getAgencyState } from "@/lib/agencies/auto";
import { personKey } from "@/lib/profile/people";
import { signPhotoUrls } from "@/lib/storage-people";
import { getAgencyByDomain, listAgencyCustomers } from "@/lib/agencies/store";
import { getPresence } from "@/lib/profile/presence";
import { STAGE_LABEL, getProfile, sweepDeadProfiles } from "@/lib/profile/store";
import type { CompanyProfile, PageLog } from "@/lib/profile/types";
import { refreshProfileAction } from "../actions";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const a = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  await sweepDeadProfiles();
  const row = await getProfile(id);
  if (!row) notFound();

  const profile = row.profile as CompanyProfile | null;
  const pages = (row.pages as PageLog[] | null) ?? [];
  const active = row.status === "queued" || row.status === "running";
  const title = profile?.company.name ?? row.name ?? row.input;
  const m = profile?.meta;

  const presence = await getPresence(row.company_id, { includeUnpublished: true });
  // En byrås profil visar också kunderna vi hittat åt den.
  const agency = await getAgencyByDomain(profile?.company.domain ?? row.domain).catch(() => null);
  // Porträtten ligger i en privat bucket och visas via signerade länkar som gäller en timme.
  const people = profile?.contact.people ?? [];
  const signed = await signPhotoUrls(people.map((p) => p.photoPath).filter((x): x is string => !!x));
  const photoUrls = Object.fromEntries(people.flatMap((p) => (p.photoPath && signed.get(p.photoPath) ? [[personKey(p.name), signed.get(p.photoPath)!]] : [])));
  const creatorAgency = profile?.creator ? await getAgencyState({ domain: profile.creator.domain, slug: profile.creator.supplierSlug }).catch(() => null) : null;
  const customers = agency ? await listAgencyCustomers(agency.id).catch(() => []) : [];
  const statusPill = (
    <StatusPill tone={row.status === "done" ? "green" : row.status === "error" ? "red" : "orange"}>{row.status === "done" ? "Klar" : row.status === "error" ? "Misslyckades" : row.stage ? STAGE_LABEL[row.stage] : "I kö"}</StatusPill>
  );
  const actions = (
    <>
      {row.status !== "done" && statusPill}
      {profile?.company.website && <a href={profile.company.website} target="_blank" rel="noreferrer" className={btnSecondary}>Öppna webbplatsen</a>}
      {a.org && row.company_id && <Link href={`/app/foretag/${row.company_id}`} className={btnSecondary}>Öppna i katalogen</Link>}
      <form action={refreshProfileAction}><input type="hidden" name="id" value={row.id} /><button disabled={active} className={btnPrimary}><RotateCw size={14} className={active ? "animate-spin" : ""} />Uppdatera</button></form>
    </>
  );

  return (
    <>
      <RunPoller active={active} />
      <Link href="/admin/foretagsprofil" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 hover:text-ink"><ChevronLeft size={15} />Spaning</Link>
      <Flash error={sp.error} />
      {row.status === "error" && <Flash error={row.error ?? "Bygget misslyckades."} />}

      {active && !profile && (
        <div className="rounded-3xl bg-white px-6 py-14 text-center">
          <p className="text-[18px] font-semibold text-ink">{title}</p>
          <p className="mt-2 text-[15px] text-accent-text">{row.stage ? `${STAGE_LABEL[row.stage]}…` : "Köad…"}</p>
          <p className="mt-1 text-[14px] text-gray-500">Det tar oftast mellan 5 och 30 sekunder. Sidan uppdateras av sig själv.</p>
          <div className="mt-6 flex justify-center">{actions}</div>
        </div>
      )}
      {active && profile && <p className="mb-4 rounded-2xl bg-accent-wash px-5 py-3 text-[13px] text-accent-text">{row.stage ? `${STAGE_LABEL[row.stage]}…` : "Köad…"} Nedan syns den förra profilen tills den nya är klar.</p>}
      {!active && !profile && (
        <div className="rounded-3xl bg-white px-6 py-14 text-center"><p className="text-[18px] font-semibold text-ink">{title}</p><p className="mt-1 text-[14px] text-gray-500">Det finns ingen profil att visa.</p><div className="mt-6 flex justify-center">{actions}</div></div>
      )}

      {profile && <ProfileView profile={profile} pages={pages} presence={presence} fallbackName={title} actions={actions} agency={creatorAgency} returnTo={`/admin/foretagsprofil/${row.id}`} profileId={row.id} photoUrls={photoUrls} />}

      {agency && (
        <section className="mt-5 rounded-3xl bg-white p-6">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="text-[16px] font-semibold text-ink">Kunder vi hittat</h2>
            <Link href={`/admin/leverantorer/${agency.slug}`} className="text-[13px] font-medium text-accent-text underline underline-offset-4">Granska i källan</Link>
          </div>
          {customers.length === 0 ? (
            <p className="text-[14px] text-gray-500">Inga kunder än. Kör insamlingen på byråns källa.</p>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-gray-500">{customers.length} {customers.length === 1 ? "kund" : "kunder"}{agency.published ? "" : ", ej publicerade än"}. De senaste:</p>
              <ul className="flex flex-wrap gap-2">{customers.slice(0, 12).map((c) => <li key={c.companyId} className="rounded-full bg-canvas px-3 py-1 text-[13px] text-gray-700">{c.name ?? c.domain}</li>)}</ul>
            </>
          )}
        </section>
      )}

      {m && (
        <p className="mt-5 text-[12px] text-gray-400">
          Skapad {formatDateTime(profile!.generatedAt)}
          {m.model ? ` · ${m.model} · ${m.inputTokens.toLocaleString("sv-SE")} + ${m.outputTokens.toLocaleString("sv-SE")} tokens${m.costEstimateSek !== null ? ` · cirka ${(m.costEstimateSek * 100).toFixed(1)} öre` : ""}` : " · utan AI"}
          {` · ${(m.durationMs / 1000).toFixed(0)} s`}
          {m.toolPages.length > 0 ? ` · AI:n läste ${m.toolPages.length} sidor` : ""}
        </p>
      )}
    </>
  );
}
