import { stockholmDay } from "@/lib/format";

// Delas mellan server och klient -- ingen "server-only", samma skäl som
// constants.ts: dialer.tsx skriver om adressen och måste bygga den likadant
// som sidorna gör.

/**
 * Vilken kö ringläget arbetar i.
 *
 * - `new`: den gemensamma kön -- oringda poster, och "Ej svar"/"Upptaget"
 *   utan återkomstdatum. Övriga poster med ett utfall hör inte hemma här --
 *   de följs upp av den som ringde dem, från Mina kontakter.
 * - `callbacks`: mina återkomster som är förfallna eller infaller idag.
 * - `mine`: alla mina kontakter, i samma ordning som Mina kontakter.
 */
export type QueueMode = "new" | "callbacks" | "mine";

export function parseQueueMode(value: string | null | undefined): QueueMode {
  return value === "callbacks" || value === "mine" ? value : "new";
}

export const QUEUE_MODE_LABEL: Record<QueueMode, string> = {
  new: "Att ringa",
  callbacks: "Dagens återkomster",
  mine: "Mina kontakter",
};

export interface DialerScope {
  profileSlug: string | null;
  mode: QueueMode;
  /** Bara poster vars webbplats ser gammal ut -- se lib/enrich/audit.ts. */
  outdatedOnly?: boolean;
  /** Fritext på ort (från bolagsverkets adress). */
  city?: string;
}

/** `?site=outdated` → filtret på. Allt annat är av. */
export function parseOutdatedOnly(value: string | null | undefined): boolean {
  return value === "outdated";
}

/** `/app/ring`, med de sökparametrar som skiljer sig från standard. `skip` är företag som hoppats över. */
export function dialerHref(scope: DialerScope, skip: readonly string[] = []): string {
  const search = new URLSearchParams();
  if (scope.profileSlug) search.set("supplier", scope.profileSlug);
  if (scope.mode !== "new") search.set("queue", scope.mode);
  if (scope.outdatedOnly) search.set("site", "outdated");
  if (scope.city) search.set("city", scope.city);
  if (skip.length) search.set("skip", skip.join(","));
  const suffix = search.toString();
  return suffix ? `/app/ring?${suffix}` : "/app/ring";
}

/**
 * Fröet till säljarens egen ordning i den gemensamma kön (scrape_dialer_queue):
 * samma säljare samma svenska dag ger samma ordning, så en omladdning hamnar
 * där den var; en annan säljare, eller i morgon, ger en annan.
 */
export function queueSeed(userId: string, now: Date = new Date()): string {
  return `${userId}:${stockholmDay(now)}`;
}
