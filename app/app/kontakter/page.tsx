import Link from "next/link";
import { Search } from "@/components/brand/icons";
import Header from "@/components/dashboard/Header";
import OutcomePill from "@/components/dashboard/OutcomePill";
import { requireMember } from "@/lib/auth";
import { contactCounts, listContacts } from "@/lib/workflow";
import { OUTCOMES } from "@/lib/calls/outcomes";
import { formatDateTime } from "@/lib/time";

type SP = { outcome?: string; q?: string; scope?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const m = await requireMember();
  const sp = await searchParams;
  const scope = sp.scope === "org" ? "org" : "mine";
  const outcome = OUTCOMES.some((o) => o.value === sp.outcome) ? sp.outcome : undefined;
  const q = sp.q?.trim() || undefined;
  const [rows, counts] = await Promise.all([listContacts(m.org.id, m.user.id, { scope, outcome, q }), contactCounts(m.org.id, m.user.id, scope)]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const href = (o?: string, s = scope) => `/app/kontakter?${new URLSearchParams({ ...(o ? { outcome: o } : {}), ...(q ? { q } : {}), scope: s })}`;
  const tab = (active: boolean) => `rounded-full px-4 py-1.5 text-[13px] font-medium ${active ? "bg-ink text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`;

  return (
    <>
      <Header title="Mina kontakter" subtitle={scope === "mine" ? `${total} företag där du loggade senaste samtalet` : `${total} företag som bolaget har ringt`} />

      <div className="mb-3 flex gap-2">
        <Link href={href(outcome, "mine")} className={tab(scope === "mine")}>Mina</Link>
        <Link href={href(outcome, "org")} className={tab(scope === "org")}>Hela bolaget</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Link href={href(undefined)} className={tab(!outcome)}>Alla ({total})</Link>
          {OUTCOMES.filter((o) => (counts[o.value] ?? 0) > 0 || outcome === o.value).map((o) => (
            <Link key={o.value} href={href(o.value)} className={tab(outcome === o.value)}>{o.label} ({counts[o.value] ?? 0})</Link>
          ))}
        </div>
        <form className="flex items-center gap-2 rounded-full bg-white px-4 py-2">
          <input type="hidden" name="scope" value={scope} />
          {outcome && <input type="hidden" name="outcome" value={outcome} />}
          <Search size={15} className="text-gray-400" />
          <input name="q" defaultValue={q ?? ""} placeholder="Sök företag" className="w-40 bg-transparent text-[14px] outline-none" />
        </form>
      </div>

      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full min-w-[920px] text-left text-[14px]">
          <thead>
            <tr className="border-b border-gray-100 text-[12px] uppercase tracking-wide text-gray-500">
              {["Företag", "Telefon", "Utfall", "Ringd av", "Senaste samtal", "Återkomst / möte", "Samtal"].map((h) => <th key={h} className="px-5 py-4 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="max-w-[240px] truncate px-5 py-3 font-medium text-ink"><Link href={`/app/foretag/${r.id}`} className="hover:underline">{r.name ?? "Okänt företag"}</Link></td>
                <td className="px-5 py-3 text-gray-600">{r.phone ? <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a> : "-"}</td>
                <td className="px-5 py-3"><OutcomePill outcome={r.outcome} /></td>
                <td className="max-w-[160px] truncate px-5 py-3 text-gray-600">{r.last_called_by_email ?? "-"}</td>
                <td className="px-5 py-3 text-gray-600">{r.last_called_at ? formatDateTime(r.last_called_at) : "-"}</td>
                <td className="px-5 py-3 text-gray-600">
                  {r.meeting_at ? `Möte ${formatDateTime(r.meeting_at)}` : r.next_callback_at ? (r.callback_has_time ? formatDateTime(r.next_callback_at) : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" }).format(r.next_callback_at)) : "-"}
                </td>
                <td className="px-5 py-3 text-gray-600">{r.call_count}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                Inga kontakter här. <Link href="/app/ring" className="font-medium text-accent-text underline underline-offset-4">Börja ringa</Link> så hamnar de du når här.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
