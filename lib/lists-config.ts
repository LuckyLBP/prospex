// Klientsäker och ren: inställningarna för en lista som fylls med Google Places (söktermer x orter).

export const LIMITS = { maxQueries: 10, maxLocations: 60, maxPagesCap: 3 } as const;

export type PlacesConfig = { queries: string; locations: string; maxPages: number };

/** Klistrad text -> rensade, unika, icke-tomma rader. */
export function parseLines(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().replace(/\s+/g, " ");
    if (t) seen.add(t);
  }
  return [...seen];
}

/**
 * Validerar och normaliserar sökinställningarna. Samma form som den gamla portalen sparar
 * ({ queries, locations, maxPages } med radbrytningar), så att insamlingen kan läsa den oförändrad.
 */
export function parsePlacesConfig(input: { queries: string; locations: string; maxPages: number | string }): { ok: true; config: PlacesConfig; requests: number } | { ok: false; error: string } {
  const queries = parseLines(input.queries);
  const locations = parseLines(input.locations);
  const pages = Math.floor(Number(input.maxPages));
  if (queries.length === 0) return { ok: false, error: "Ange minst en sökterm." };
  if (queries.length > LIMITS.maxQueries) return { ok: false, error: `Högst ${LIMITS.maxQueries} söktermer.` };
  if (locations.length === 0) return { ok: false, error: "Ange minst en ort." };
  if (locations.length > LIMITS.maxLocations) return { ok: false, error: `Högst ${LIMITS.maxLocations} orter.` };
  if (!Number.isFinite(pages) || pages < 1 || pages > LIMITS.maxPagesCap) return { ok: false, error: `Antal sidor måste vara 1 till ${LIMITS.maxPagesCap}.` };
  return { ok: true, config: { queries: queries.join("\n"), locations: locations.join("\n"), maxPages: pages }, requests: queries.length * locations.length * pages };
}

/** Kostnaden i anrop för en körning, högst: söktermer x orter x sidor. Googles gratisnivå är 1 000 anrop i månaden. */
export const FREE_MONTHLY_REQUESTS = 1000;

export function toForm(config: unknown): { queries: string; locations: string; maxPages: number } {
  const c = (config ?? {}) as Partial<PlacesConfig>;
  return {
    queries: typeof c.queries === "string" ? c.queries.replace(/\r/g, "") : "",
    locations: typeof c.locations === "string" ? c.locations.replace(/\r/g, "") : "",
    maxPages: Number.isInteger(c.maxPages) ? (c.maxPages as number) : 3,
  };
}
