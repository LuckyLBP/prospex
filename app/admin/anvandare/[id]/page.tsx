import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { FormSection } from "@/components/admin/FormSection";
import { Flash, StatusPill } from "@/components/admin/bits";
import { btnPrimary } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getAdminUser } from "@/lib/admin-data";
import { listAudit } from "@/lib/audit";
import { describeAudit } from "@/lib/audit-describe";
import { formatDateTime, formatRelative } from "@/lib/format";
import { toggleAdminAction, toggleUserAction } from "../actions";

export default async function UserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getAdminUser(id);
  if (!user) notFound();
  const mine = id === me.user.id;
  const activity = (await listAudit({ actor: user.email }, { limit: 8 })).rows;

  return (
    <>
      <PageHeader back={{ href: "/admin/anvandare", label: "Användare" }} title={user.email}
        subtitle={user.last_sign_in ? `Senast inloggad ${formatRelative(user.last_sign_in.toISOString())}` : "Har inte loggat in än"}
        actions={<><StatusPill tone={user.active ? "green" : "red"}>{user.active ? "Aktiv" : "Avstängd"}</StatusPill>{user.is_platform_admin && <StatusPill tone="dark">Admin</StatusPill>}{mine && <StatusPill>Du</StatusPill>}</>} />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="flex flex-col gap-5">
        <FormSection title="Bolag och roll" description="Medlemskap ändras på bolagets egen sida.">
          {user.org_name ? (
            <p className="text-[14px] text-gray-800">{user.role === "owner" ? "Ägare" : "Medlem"} i <Link href={`/admin/bolag/${user.org_slug}`} className="font-medium underline underline-offset-4">{user.org_name}</Link></p>
          ) : <p className="text-[14px] text-gray-500">Tillhör inget bolag.</p>}
        </FormSection>

        <FormSection title="Plattformsadmin" description="Admin kommer åt hela adminportalen. Det måste alltid finnas minst en.">
          <form action={toggleAdminAction}>
            <input type="hidden" name="user_id" value={user.user_id} /><input type="hidden" name="admin" value={user.is_platform_admin ? "0" : "1"} />
            {user.is_platform_admin
              ? <ConfirmButton label="Ta bort adminrättigheter" confirmLabel="Ja, ta bort" message="Ta bort adminrättigheterna?" />
              : <button className={btnPrimary}>Gör till admin</button>}
          </form>
        </FormSection>

        <FormSection title={user.active ? "Stäng av användaren" : "Aktivera användaren"} description={user.active ? "En avstängd användare kommer inte in i portalen. Inget raderas." : "Användaren kommer in i portalen igen."}>
          <form action={toggleUserAction}>
            <input type="hidden" name="user_id" value={user.user_id} /><input type="hidden" name="active" value={user.active ? "0" : "1"} />
            {user.active ? <ConfirmButton label="Stäng av" confirmLabel="Ja, stäng av" message="Stänga av användaren?" /> : <button className={btnPrimary}>Aktivera</button>}
          </form>
        </FormSection>

        <FormSection title="Senaste adminaktivitet" description="Det användaren gjort i adminportalen.">
          {activity.length === 0 ? <p className="text-[14px] text-gray-500">Ingen aktivitet.</p> : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {activity.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
                  <span className="text-gray-800">{describeAudit(r)}</span>
                  <span className="shrink-0 text-[12px] text-gray-400">{formatDateTime(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </FormSection>
      </div>
    </>
  );
}
