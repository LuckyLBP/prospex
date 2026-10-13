import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, RotateCw } from "@/components/brand/icons";
import ProfileView from "@/components/admin/profile/ProfileView";
import RunPoller from "@/components/admin/RunPoller";
import { Flash, StatusPill } from "@/components/admin/bits";
import { btnPrimary, btnSecondary } from "@/components/admin/ui";
import { requireProfileAccess } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { personKey } from "@/lib/profile/people";
import { STAGE_LABEL, getOrgProfile, sweepDeadProfiles } from "@/lib/profile/store";
import type { CompanyProfile, PageLog } from "@/lib/profile/types";
import { signPhotoUrls } from "@/lib/storage-people";
import { refreshProfileAction } from "../actions";

export default async function TenantProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const m = await requireProfileAccess();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await sweepDeadProfiles();
  const row = await getOrgProfile(id, m.org.id);
  if (!row) notFound();

  const profile = row.profile as CompanyProfile | null;
  const active = row.status === "queued" || row.status === "running";
  const title = profile?.company.name ?? row.name ?? row.input;
  const people = profile?.contact.people ?? [];
  const signed = await signPhotoUrls(people.map((p) => p.photoPath).filter((x): x is string => !!x));
  const photoUrls = Object.fromEntries(people.flatMap((p) => (p.photoPath && signed.get(p.photoPath) ? [[personKey(p.name), signed.get(p.photoPath)!]] : [])));

  const statusPill = <StatusPill tone={row.status === "done" ? "green" : row.status === "error" ? "red" : "orange"}>{row.status === "done" ? "Klar" : row.status === "error" ? "Misslyckades" : row.stage ? STAGE_LABEL[row.stage] : "I kö"}</StatusPill>;
  const actions = (
    <>
      {row.status !== "done" && statusPill}
      {profile?.company.website && <a href={profile.company.website} target="_blank" rel="noreferrer" className={btnSecondary}>Öppna webbplatsen</a>}
      <form action={refreshProfileAction}><input type="hidden" name="id" value={row.id} /><button disabled={active} className={btnPrimary}><RotateCw size={14} className={active ? "animate-spin" : ""} />Uppdatera</button></form>
    </>
  );

  return (
    <>
      <RunPoller active={active} />
      <Link href="/app/spaning" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 hover:text-ink"><ChevronLeft size={15} />Spaning</Link>
      <Flash error={sp.error} />
      {row.status === "error" && <Flash error={row.error ?? "Bygget misslyckades."} />}

      {active && !profile && (
        <div className="rounded-3xl bg-white px-6 py-14 text-center">
          <p className="text-[18px] font-semibold text-ink">{title}</p>
          <p className="mt-2 text-[15px] text-accent-text">{row.stage ? `${STAGE_LABEL[row.stage]}…` : "Köad…"}</p>
          <p className="mt-1 text-[14px] text-gray-500">Det tar oftast mellan 5 och 30 sekunder. Sidan uppdateras av sig själv.</p>
        </div>
      )}
      {active && profile && <p className="mb-4 rounded-2xl bg-accent-wash px-5 py-3 text-[13px] text-accent-text">{row.stage ? `${STAGE_LABEL[row.stage]}…` : "Köad…"} Nedan syns den förra spaningen tills den nya är klar.</p>}
      {!active && !profile && (
        <div className="rounded-3xl bg-white px-6 py-14 text-center"><p className="text-[18px] font-semibold text-ink">{title}</p><p className="mt-1 text-[14px] text-gray-500">Det finns ingen spaning att visa.</p><div className="mt-6 flex justify-center">{actions}</div></div>
      )}

      {profile && <ProfileView profile={profile} pages={[]} presence={[]} fallbackName={title} actions={actions} tenant photoUrls={photoUrls} />}
      {profile && <p className="mt-5 text-[12px] text-gray-400">Validerad {formatDateTime(profile.generatedAt)}</p>}
    </>
  );
}
