import { notFound } from "next/navigation";
import Dialer from "@/components/dialer/Dialer";
import Header from "@/components/dashboard/Header";
import { requireMember } from "@/lib/auth";
import { getCardsMetered } from "@/lib/access/release";
import { signCompanyId } from "@/lib/access/tokens";
import { getQueueOrder } from "@/lib/dialer/queue";
import { parseOutdatedOnly } from "@/lib/dialer/scope";
import { archiveAction } from "../../actions";

/**
 * Ett enskilt företag, öppnat från sök, en lista eller kontakter. Samma kort som i ringläget (ring, skanna, profil,
 * samtalsutfall och anteckningar), men utan kö. Uppgifterna släpps inom gränserna i lib/access.
 */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await requireMember();
  const { cards, limited } = await getCardsMetered({ userId: m.user.id, orgId: m.org.id, isAdmin: m.isAdmin }, [id]);

  if (cards.length === 0) {
    if (!limited) notFound();
    return (
      <>
        <Header title="Det går inte att visa företaget just nu" subtitle="Gränsen för hur många företag som visas är nådd" />
        <div className="rounded-3xl bg-white p-6 text-[14px] text-gray-700">{limited.message}</div>
      </>
    );
  }

  const archived = cards[0].contact?.archived === true;
  return (
    <>
      <Dialer
        init={{
          ids: [id],
          startIndex: 0,
          cards,
          scope: { profileSlug: null, mode: "mine", outdatedOnly: parseOutdatedOnly(undefined) },
          order: await getQueueOrder(m.user.id),
          suppliers: [],
          stats: { callsToday: 0 },
          queueBuiltAt: Date.now(),
          capped: false,
          me: m.user.email,
          macs: { [id]: signCompanyId(m.user.id, id) },
          limit: null,
          single: true,
        }}
      />
      <form action={archiveAction} className="mx-auto mt-2 w-full max-w-[720px] px-2 pb-24">
        <input type="hidden" name="company_id" value={id} />
        <input type="hidden" name="archived" value={archived ? "0" : "1"} />
        <input type="hidden" name="redirect_to" value={`/app/foretag/${id}`} />
        <button className="text-[13px] font-medium text-gray-500 underline underline-offset-4 hover:text-ink">{archived ? "Återställ från arkivet" : "Arkivera företaget"}</button>
      </form>
    </>
  );
}
