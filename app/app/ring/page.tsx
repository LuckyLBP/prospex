import Dialer from "@/components/dialer/Dialer";
import { requireMember } from "@/lib/auth";
import { getSourcesCached } from "@/lib/cached";
import { homeStats } from "@/lib/workflow";
import { getQueueIds, getQueueOrder } from "@/lib/dialer/queue";
import { loadList, saveNewList } from "@/lib/dialer/lists";
import { getPrefs } from "@/lib/account";
import { resumeList } from "@/lib/dialer/resume";
import { getCardsMetered } from "@/lib/access/release";
import { signCompanyId } from "@/lib/access/tokens";
import { CARD_BATCH_MAX } from "@/lib/dialer/card-types";
import { QUEUE_LIMIT } from "@/lib/dialer/constants";
import { parseOutdatedOnly, parseQueueMode, parseSources, parseTemplate, sameScope, type DialerScope } from "@/lib/dialer/scope";
import { AHEAD, BEHIND } from "@/lib/dialer/window";

type SP = { supplier?: string; city?: string; queue?: string; site?: string; c?: string; mall?: string; ny?: string };

export default async function RingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const m = await requireMember();
  const sp = await searchParams;
  const asked: DialerScope = {
    sources: parseSources(sp.supplier),
    mode: parseQueueMode(sp.queue),
    outdatedOnly: parseOutdatedOnly(sp.site),
    city: sp.city?.trim() || undefined,
    template: parseTemplate(sp.mall),
  };
  const hasFilters = !!(sp.supplier || sp.city || sp.site || sp.mall || sp.queue);
  const wantsNew = sp.ny === "1";

  // Allt som inte beror på något annat hämtas samtidigt. Den sparade listan behövs bara i läget "new".
  const [order, suppliers, stats, saved] = await Promise.all([
    getQueueOrder(m.user.id),
    getSourcesCached(),
    homeStats(m.org.id, m.user.id),
    asked.mode === "new" ? loadList(m.org.id, m.user.id) : Promise.resolve(null),
  ]);

  // "Att ringa" har en sparad lista: utan filter i adressen fortsätter den, och den fortsätter också när adressen
  // beskriver samma urval. Ett nytt urval, eller ny=1, bygger en ny lista som ersätter den. Återkomster och Mina sparas inte.
  let scope = asked;
  let ids: string[] = [];
  let startIndex = 0;
  let list: { offset: number; total: number; resumed: boolean } | null = null;

  if (asked.mode === "new") {
    // En adress utan filter och utan ny=1 betyder "öppna ringläget": då gäller den sparade listans urval. ny=1 betyder
    // alltid "bygg en ny lista med exakt de filter som står i adressen", även när de är inga alls.
    if (saved && !hasFilters && !wantsNew) scope = saved.scope;
    // Utan sparad lista och utan eget val börjar en ny lista med mallen som är vald i Inställningar.
    else if (!saved && !hasFilters && !wantsNew) scope = { ...asked, template: (await getPrefs(m.user.id)).template ?? undefined };
    if (saved && !saved.completed && !wantsNew && sameScope(saved.scope, scope)) {
      // Fortsätt: bara de sparade företag som fortfarande får ringas, i sparad ordning.
      const eligible = new Set(await getQueueIds(m.org.id, m.user.id, saved.scope, saved.order, 5000));
      const r = resumeList(saved.ids, saved.currentId, eligible);
      if (r.ids.length > 0 && r.startIndex < r.ids.length) {
        ids = r.ids;
        startIndex = r.startIndex;
        list = { offset: saved.ids.length - r.ids.length, total: saved.ids.length, resumed: true };
      }
    }
    if (!list) {
      ids = await getQueueIds(m.org.id, m.user.id, scope, order);
      if (ids.length > 0) {
        await saveNewList(m.org.id, m.user.id, scope, order, ids);
        list = { offset: 0, total: ids.length, resumed: false };
      }
    }
  } else {
    ids = await getQueueIds(m.org.id, m.user.id, scope, order);
    // En omladdning hamnar på samma företag om det fortfarande finns i kön.
    const at = sp.c ? ids.indexOf(sp.c) : -1;
    startIndex = at >= 0 ? at : 0;
  }

  const first = ids.slice(Math.max(0, startIndex - BEHIND), startIndex + AHEAD).slice(0, CARD_BATCH_MAX);
  const { cards, limited } = await getCardsMetered({ userId: m.user.id, orgId: m.org.id, isAdmin: m.isAdmin }, first);
  const macs = Object.fromEntries(ids.map((id) => [id, signCompanyId(m.user.id, id)]));

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
        macs,
        limit: limited?.message ?? null,
        list,
      }}
    />
  );
}
