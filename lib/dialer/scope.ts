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

/**
 * Färdiga urval för "Att ringa". `fresh`: bara de ingen i bolaget ringt än. `noanswer`: bara de som inte svarade eller
 * var upptagna en tidigare dag. Utan mall visas båda, de oringda först.
 */
export type QueueTemplate = "fresh" | "noanswer";

export const TEMPLATES: { value: QueueTemplate | null; param: string | null; label: string; hint: string }[] = [
  { value: null, param: null, label: "Allt att ringa", hint: "Oringda först, sedan de som inte svarade" },
  { value: "fresh", param: "ingen", label: "Ingen kontaktad", hint: "Företag som ingen i bolaget ringt än" },
  { value: "noanswer", param: "ejsvar", label: "Ej svarade", hint: "Svarade inte eller var upptagna en tidigare dag" },
];

/** `?mall=ingen` och `?mall=ejsvar`. Allt annat är ingen mall. */
export function parseTemplate(value: string | null | undefined): QueueTemplate | undefined {
  return TEMPLATES.find((t) => t.param && t.param === value)?.value ?? undefined;
}

export const templateLabel = (t: QueueTemplate | undefined): string => TEMPLATES.find((x) => x.value === (t ?? null))?.label ?? "Allt att ringa";

export interface DialerScope {
  /** Vilka leverantörer och listor urvalet gäller. Tom lista = alla publicerade. */
  sources: string[];
  mode: QueueMode;
  /** Färdigt urval i "Att ringa". */
  template?: QueueTemplate;
  /** Bara poster vars webbplats ser gammal ut -- se lib/enrich/audit.ts. */
  outdatedOnly?: boolean;
  /** Fritext på ort (från bolagsverkets adress). */
  city?: string;
}

/** Högst så många källor i ett urval. */
export const MAX_SOURCES = 20;

/** `?supplier=eniro,roi` → ["eniro", "roi"]. Bara giltiga slugs, utan dubbletter. */
export function parseSources(value: string | null | undefined): string[] {
  const slugs = (value ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(x));
  return [...new Set(slugs)].slice(0, MAX_SOURCES);
}

/** Ett sparat urval kan vara skrivet före flera källor fanns (`profileSlug`). Då blir det en lista med en källa. */
export function normalizeScope(raw: Record<string, unknown>): DialerScope {
  const sources = Array.isArray(raw.sources) ? (raw.sources as unknown[]).filter((x): x is string => typeof x === "string") : typeof raw.profileSlug === "string" ? [raw.profileSlug] : [];
  return { sources, mode: parseQueueMode(raw.mode as string), outdatedOnly: raw.outdatedOnly === true, city: typeof raw.city === "string" && raw.city ? raw.city : undefined, template: parseTemplate(TEMPLATES.find((t) => t.value === raw.template)?.param) };
}

/** `?site=outdated` → filtret på. Allt annat är av. */
export function parseOutdatedOnly(value: string | null | undefined): boolean {
  return value === "outdated";
}

/** `/app/ring`, med de sökparametrar som skiljer sig från standard. `skip` är företag som hoppats över. */
export function dialerHref(scope: DialerScope, skip: readonly string[] = [], opts: { ny?: boolean } = {}): string {
  const search = new URLSearchParams();
  const tpl = TEMPLATES.find((t) => t.value === (scope.template ?? null))?.param;
  if (tpl) search.set("mall", tpl);
  if (opts.ny) search.set("ny", "1");
  if (scope.sources.length) search.set("supplier", scope.sources.join(","));
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

/** Samma urval? Används för att avgöra om den sparade listan fortfarande är den som efterfrågas. Ren. */
export function sameScope(a: DialerScope, b: DialerScope): boolean {
  const city = (s: DialerScope) => (s.city ?? "").trim().toLowerCase();
  return a.mode === b.mode && !!a.outdatedOnly === !!b.outdatedOnly && city(a) === city(b) && [...a.sources].sort().join(",") === [...b.sources].sort().join(",") && (a.template ?? null) === (b.template ?? null);
}
