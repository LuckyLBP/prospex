import Dialer from "@/components/dialer/Dialer";
import { requireMember } from "@/lib/auth";
import { getSources } from "@/lib/queries";
import { homeStats } from "@/lib/workflow";
import { getQueueIds, getQueueOrder } from "@/lib/dialer/queue";
import { getCards } from "@/lib/dialer/cards";
import { CARD_BATCH_MAX } from "@/lib/dialer/card-types";
import { QUEUE_LIMIT } from "@/lib/dialer/constants";
import { parseOutdatedOnly, parseQueueMode } from "@/lib/dialer/scope";
import { AHEAD, BEHIND } from "@/lib/dialer/window";

type SP = { supplier?: string; city?: string; queue?: string; site?: string; c?: string };

export default async function RingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const m = await requireMember();
  const sp = await searchParams;
  const scope = {
    profileSlug: sp.supplier || null,
    mode: parseQueueMode(sp.queue),
    outdatedOnly: parseOutdatedOnly(sp.site),
    city: sp.city?.trim() || undefined,
  };

  const order = await getQueueOrder(m.user.id);
  const [ids, suppliers, stats] = await Promise.all([
    getQueueIds(m.org.id, m.user.id, scope, order),
    getSources(),
    homeStats(m.org.id, m.user.id),
  ]);

  // En omladdning hamnar på samma företag om det fortfarande finns i kön.
  const at = sp.c ? ids.indexOf(sp.c) : -1;
  const startIndex = at >= 0 ? at : 0;
  const first = ids.slice(Math.max(0, startIndex - BEHIND), startIndex + AHEAD).slice(0, CARD_BATCH_MAX);
  const cards = await getCards(m.org.id, first);

  const builtAt = Date.now();
  return (
    <Dialer
      key={builtAt}
      init={{
        ids,
        startIndex,
        cards,
        scope,
        order,
        suppliers: suppliers.map(({ slug, name, n, logo, kind, category, icon }) => ({ slug, name, n, logo, kind, category, icon })),
        stats: { callsToday: stats.calls_today },
        queueBuiltAt: builtAt,
        capped: ids.length >= QUEUE_LIMIT,
        me: m.user.email,
      }}
    />
  );
}
