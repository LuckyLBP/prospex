import Link from "next/link";
import { Trash2, UserPlus } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { requireOwner } from "@/lib/auth";
import { listInvites, listMembers } from "@/lib/orgs";
import { teamStats } from "@/lib/workflow";
import { formatRate, parseTeamPeriod, TEAM_PERIODS } from "@/lib/calls/team";
import { formatDateTime } from "@/lib/time";
import { cancelInviteAction, inviteAction, removeMemberAction, roleAction } from "./actions";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ days?: string; error?: string }> }) {
  const m = await requireOwner();
  const sp = await searchParams;
  const days = parseTeamPeriod(sp.days);
  const [members, invites, { stats, suppliers }] = await Promise.all([listMembers(m.org.id), listInvites(m.org.id), teamStats(m.org.id, days)]);
  const field = "rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-accent";
  const th = "px-5 py-3 font-medium";

  return (
    <>
      <Header title="Team" subtitle={`${m.org.name} · ${members.length} medlemmar`} />
      {sp.error && <p className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] text-rose-800">{sp.error}</p>}

      <div className="mb-3 flex gap-2">
        {TEAM_PERIODS.map((d) => (
          <Link key={d} href={`/app/team?days=${d}`} className={`rounded-full px-4 py-1.5 text-[13px] font-medium ${d === days ? "bg-ink text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>{d} dagar</Link>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-5">
        {[
          ["Samtal", stats.total.calls],
          ["Företag", stats.total.companies],
          ["Nådda", `${stats.total.reached} (${formatRate(stats.total.reached, stats.total.calls)})`],
          ["Möten", stats.total.meetings],
          ["Kunder", stats.total.customers],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-3xl bg-white p-6">
            <p className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">{v}</p>
            <p className="mt-3 text-[13px] text-gray-500">{l}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="overflow-x-auto rounded-3xl bg-white">
          <h2 className="px-6 pt-5 text-[16px] font-semibold text-ink">Per säljare</h2>
          <table className="w-full text-left text-[13px]">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-500"><th className={th}>Säljare</th><th className={th}>Samtal</th><th className={th}>Nådda</th><th className={th}>Möten</th><th className={th}>Kunder</th></tr></thead>
            <tbody>
              {stats.sellers.map((s) => (
                <tr key={s.userId} className="border-t border-gray-50">
                  <td className="max-w-[200px] truncate px-5 py-2.5 font-medium text-ink">{s.email}</td>
                  <td className="px-5 py-2.5">{s.calls}</td><td className="px-5 py-2.5">{formatRate(s.reached, s.calls)}</td><td className="px-5 py-2.5">{s.meetings}</td><td className="px-5 py-2.5">{s.customers}</td>
                </tr>
              ))}
              {stats.sellers.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">Inga samtal under perioden.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-3xl bg-white">
          <h2 className="px-6 pt-5 text-[16px] font-semibold text-ink">Per leverantör</h2>
          <table className="w-full text-left text-[13px]">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-500"><th className={th}>Leverantör</th><th className={th}>Samtal</th><th className={th}>Nådda</th><th className={th}>Möten</th><th className={th}>Kunder</th></tr></thead>
            <tbody>
              {stats.sources.map((s) => (
                <tr key={s.profileId} className="border-t border-gray-50">
                  <td className="max-w-[200px] truncate px-5 py-2.5 font-medium text-ink">{suppliers.get(s.profileId) ?? "-"}</td>
                  <td className="px-5 py-2.5">{s.calls}</td><td className="px-5 py-2.5">{formatRate(s.reached, s.calls)}</td><td className="px-5 py-2.5">{s.meetings}</td><td className="px-5 py-2.5">{s.customers}</td>
                </tr>
              ))}
              {stats.sources.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">Inga samtal under perioden.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-[18px] font-semibold text-ink"><UserPlus size={18} /> Medlemmar</h2>
        <form action={inviteAction} className="mb-5 flex flex-wrap gap-3">
          <input type="email" name="email" required placeholder="namn@foretag.se" className={`${field} min-w-[260px] flex-1`} />
          <select name="role" className={field}><option value="member">Medlem</option><option value="owner">Ägare</option></select>
          <button className="rounded-full bg-ink px-6 py-2.5 text-[14px] font-semibold text-white">Bjud in</button>
        </form>
        <table className="w-full text-left text-[14px]">
          <thead><tr className="text-[12px] uppercase tracking-wide text-gray-500"><th className="py-2 font-medium">E-post</th><th className="py-2 font-medium">Roll</th><th className="py-2 font-medium">Senaste samtal</th><th /></tr></thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.user_id} className="border-t border-gray-50">
                <td className="py-2.5 font-medium text-ink">{u.email}{u.user_id === m.user.id && <span className="ml-2 text-[12px] text-gray-400">(du)</span>}</td>
                <td className="py-2.5">
                  <form action={roleAction} className="flex items-center gap-2">
                    <input type="hidden" name="user_id" value={u.user_id} />
                    <select name="role" defaultValue={u.role} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[13px]"><option value="member">Medlem</option><option value="owner">Ägare</option></select>
                    <button className="text-[12px] text-gray-500 underline underline-offset-4">Spara</button>
                  </form>
                </td>
                <td className="py-2.5 text-gray-500">{u.last_call ? formatDateTime(u.last_call) : "-"}</td>
                <td className="py-2.5 text-right">
                  {u.user_id !== m.user.id && (
                    <form action={removeMemberAction}><input type="hidden" name="user_id" value={u.user_id} /><button aria-label="Ta bort" className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button></form>
                  )}
                </td>
              </tr>
            ))}
            {invites.map((i) => (
              <tr key={i.id} className="border-t border-gray-50 text-gray-500">
                <td className="py-2.5">{i.email} <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">Inbjuden</span></td>
                <td className="py-2.5">{i.role === "owner" ? "Ägare" : "Medlem"}</td><td />
                <td className="py-2.5 text-right"><form action={cancelInviteAction}><input type="hidden" name="id" value={i.id} /><button aria-label="Avbryt inbjudan" className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-[12px] text-gray-500">Den inbjudna loggar in med sin e-postadress och en kod. Inbjudan tas emot automatiskt vid första inloggningen.</p>
      </div>
    </>
  );
}
