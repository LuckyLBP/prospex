import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { Field, FormSection, Input } from "@/components/admin/FormSection";
import { Flash, StatusPill } from "@/components/admin/bits";
import { btnPrimary, btnSecondary } from "@/components/admin/ui";
import FormSelect from "@/components/ui/FormSelect";
import { getOrganizationBySlug } from "@/lib/admin-data";
import { listInvites, listMembers } from "@/lib/orgs";
import { formatDate, formatDateTime } from "@/lib/time";
import { cancelInviteAction, inviteMemberAction, removeMemberAction, roleAction, toggleOrgAction, toggleProfileAccessAction } from "../actions";

const ROLES = [{ value: "member", label: "Medlem" }, { value: "owner", label: "Ägare" }];

export default async function OrgDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await getOrganizationBySlug(slug);
  if (!org) notFound();
  const [members, invites] = await Promise.all([listMembers(org.id), listInvites(org.id)]);

  return (
    <>
      <PageHeader back={{ href: "/admin/bolag", label: "Bolag" }} title={org.name}
        subtitle={`Skapat ${formatDate(org.created_at)} · ${org.contacts.toLocaleString("sv-SE")} kontakter · ${org.calls_30d.toLocaleString("sv-SE")} samtal senaste 30 dagarna`}
        actions={<StatusPill tone={org.active ? "green" : "gray"}>{org.active ? "Aktiv" : "Avstängd"}</StatusPill>} />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="flex flex-col gap-5">
        <FormSection title="Medlemmar" description="Ägare kan bjuda in och ta bort andra. Ett bolag måste alltid ha minst en ägare.">
          {members.length === 0 ? <p className="text-[14px] text-gray-500">Inga medlemmar än.</p> : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {members.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#14161F]">{m.email}</p>
                    <p className="text-[12px] text-gray-500">{m.last_call ? `Senaste samtal ${formatDateTime(new Date(m.last_call))}` : "Har inte ringt än"}</p>
                  </div>
                  <form action={roleAction} className="flex items-center gap-2">
                    <input type="hidden" name="org_id" value={org.id} /><input type="hidden" name="user_id" value={m.user_id} />
                    <FormSelect name="role" ariaLabel={`Roll för ${m.email}`} defaultValue={m.role} options={ROLES} className="w-[120px]" />
                    <button className={btnSecondary}>Spara</button>
                  </form>
                  <form action={removeMemberAction}>
                    <input type="hidden" name="org_id" value={org.id} /><input type="hidden" name="user_id" value={m.user_id} />
                    <ConfirmButton label="Ta bort" confirmLabel="Ja, ta bort" message={`Ta bort ${m.email}?`} className="rounded-full p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600" />
                  </form>
                </li>
              ))}
            </ul>
          )}
        </FormSection>

        <FormSection title="Bjud in" description="Den inbjudna loggar in med sin e-postadress och en kod. Finns kontot redan läggs personen till direkt.">
          <form action={inviteMemberAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="org_id" value={org.id} />
            <div className="min-w-[240px] flex-1"><Field label="E-post"><Input name="email" type="email" required placeholder="namn@foretag.se" /></Field></div>
            <div className="w-[140px]"><Field label="Roll"><FormSelect name="role" ariaLabel="Roll" defaultValue="member" options={ROLES} className="!h-[42px] !rounded-xl" /></Field></div>
            <button className={btnPrimary}>Bjud in</button>
          </form>
          {invites.length > 0 && (
            <div>
              <p className="mb-1 text-[12px] font-medium text-gray-600">Väntande inbjudningar</p>
              <ul className="flex flex-col divide-y divide-gray-100">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5 text-[14px]">
                    <span className="flex-1 truncate text-gray-800">{i.email}</span>
                    <StatusPill tone="amber">{i.role === "owner" ? "Ägare" : "Medlem"}</StatusPill>
                    <form action={cancelInviteAction}><input type="hidden" name="org_id" value={org.id} /><input type="hidden" name="invite_id" value={i.id} />
                      <button aria-label={`Avbryt inbjudan till ${i.email}`} title="Avbryt inbjudan" className="rounded-full p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </FormSection>

        <FormSection title="Företagsprofil" description="Låter bolagets medlemmar söka upp företag och bygga profiler själva, utan gräns. De ser profilen men inte hur vi hittat källorna, och bara de profiler bolaget själv skapat. Varje bygge kostar några kronor.">
          <form action={toggleProfileAccessAction} className="flex items-center gap-3">
            <input type="hidden" name="org_id" value={org.id} /><input type="hidden" name="on" value={org.profile_access ? "0" : "1"} />
            <StatusPill tone={org.profile_access ? "green" : "gray"}>{org.profile_access ? "Öppen" : "Stängd"}</StatusPill>
            {org.profile_access ? <ConfirmButton label="Stäng" confirmLabel="Ja, stäng" message="Stänga Företagsprofil för bolaget?" /> : <button className={btnPrimary}>Öppna för bolaget</button>}
          </form>
        </FormSection>

        <FormSection title={org.active ? "Stäng av bolaget" : "Aktivera bolaget"} description={org.active ? "Ett avstängt bolag och dess medlemmar kommer inte in i portalen. Inget raderas." : "Medlemmarna kommer in i portalen igen."}>
          <form action={toggleOrgAction}>
            <input type="hidden" name="org_id" value={org.id} /><input type="hidden" name="active" value={org.active ? "0" : "1"} />
            {org.active ? <ConfirmButton label="Stäng av bolaget" confirmLabel="Ja, stäng av" message={`Stänga av ${org.name}?`} /> : <button className={btnPrimary}>Aktivera bolaget</button>}
          </form>
        </FormSection>
      </div>
    </>
  );
}
