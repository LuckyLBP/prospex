import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, CalendarDays } from "lucide-react";
import Header from "@/components/dashboard/Header";
import CompanyCard from "@/components/dashboard/CompanyCard";
import CallForm from "@/components/dashboard/CallForm";
import OutcomePill from "@/components/dashboard/OutcomePill";
import { requireMember } from "@/lib/auth";
import { releaseCompanies } from "@/lib/access/meter";
import { LIMIT_MESSAGE } from "@/lib/access/limits";
import { getCallLogs, getCompany, getContact, getUpcomingForCompany } from "@/lib/workflow";
import { outcomeLabel } from "@/lib/calls/outcomes";
import { kindMeta } from "@/lib/status";
import { addDays, dateKey, formatDateTime } from "@/lib/time";
import { archiveAction } from "../../actions";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await requireMember();
  // Uppgifterna släpps bara inom gränserna för hur många företag en användare tar del av (lib/access).
  const released = await releaseCompanies({ userId: m.user.id, orgId: m.org.id, isAdmin: m.isAdmin }, [id]);
  if (released.allowed.length === 0) {
    return (
      <>
        <Header title="Det går inte att visa företaget just nu" subtitle="Gränsen för hur många företag som visas är nådd" />
        <div className="rounded-3xl bg-white p-6 text-[14px] text-gray-700">{LIMIT_MESSAGE[released.reason ?? "minute"]}</div>
      </>
    );
  }
  const company = await getCompany(id);
  if (!company) notFound();
  const [contact, logs, events] = await Promise.all([getContact(m.org.id, id), getCallLogs(m.org.id, id), getUpcomingForCompany(m.org.id, id)]);
  const tomorrow = addDays(dateKey(new Date()), 1);
  const archived = !!contact?.archived_at;

  return (
    <>
      <Header
        title={company.name ?? "Okänt företag"}
        subtitle={contact?.outcome ? `${outcomeLabel(contact.outcome)} · ${contact.call_count} samtal${archived ? " · arkiverad" : ""}` : "Inte ringd av bolaget än"}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-5">
          <CompanyCard company={company} />
          <div className="rounded-3xl bg-white p-6">
            <h3 className="mb-3 text-[16px] font-semibold text-[#14161F]">Samtalshistorik</h3>
            {logs.length === 0 ? (
              <p className="text-[14px] text-gray-500">Inga samtal loggade.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-[13px]">
                {logs.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-3">
                    <OutcomePill outcome={l.outcome} />
                    <span className="text-gray-500">{formatDateTime(l.called_at)}</span>
                    <span className="text-gray-500">{l.user_email}</span>
                    {l.note && <span className="text-gray-800">{l.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div className="rounded-3xl bg-white p-6">
            <h3 className="mb-4 text-[16px] font-semibold text-[#14161F]">Logga samtal</h3>
            <CallForm companyId={id} redirectTo={`/app/foretag/${id}`} defaultCallbackDate={tomorrow} defaultMeeting={`${tomorrow}T10:00`} current={contact?.outcome ?? null} submitLabel="Spara" />
          </div>
          <form action={archiveAction} className="rounded-3xl bg-white p-6">
            <input type="hidden" name="company_id" value={id} />
            <input type="hidden" name="archived" value={archived ? "0" : "1"} />
            <input type="hidden" name="redirect_to" value={`/app/foretag/${id}`} />
            <h3 className="mb-1 text-[16px] font-semibold text-[#14161F]">{archived ? "Arkiverad" : "Klar med företaget?"}</h3>
            <p className="mb-4 text-[13px] text-gray-600">
              {archived ? "Företaget ligger i arkivet och dyker inte upp i kön." : "Arkivera så ringer ingen i bolaget det igen. Det raderas inte och går att återställa."}
            </p>
            <button className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-[13px] font-medium hover:border-gray-500">
              {archived ? <><ArchiveRestore size={15} /> Återställ</> : <><Archive size={15} /> Arkivera</>}
            </button>
          </form>
          <div className="rounded-3xl bg-white p-6">
            <h3 className="mb-3 flex items-center gap-2 text-[16px] font-semibold text-[#14161F]"><CalendarDays size={16} /> Kommande</h3>
            {events.length === 0 ? (
              <p className="text-[14px] text-gray-500">Inga kommande händelser.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-[13px]">
                {events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="text-gray-800">{kindMeta(e.kind).label}</span>
                    <span className="shrink-0 text-gray-500">{formatDateTime(e.starts_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/app/kalender" className="mt-4 inline-block text-[13px] font-medium underline underline-offset-4">Öppna kalendern</Link>
          </div>
        </div>
      </div>
    </>
  );
}
