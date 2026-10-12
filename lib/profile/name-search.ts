import { pool } from "@/lib/db";
import { buildSearchNeedle } from "@/lib/records/search";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { isPlacesConfigured, searchPlaces, type PlaceHit } from "./places";

// Sök på företagsnamn när varken org.nr eller webbadress är känd. Ger några kandidater att välja bland, hämtade ur
// vår katalog först och Google Places därefter. Användaren väljer, så att ingen profil byggs på fel företag.

export interface Candidate {
  /** Stabilt id för listan: domänen, annars org.nr, annars namn och ort. */
  key: string;
  name: string;
  city: string | null;
  domain: string | null;
  orgnr: string | null;
  source: "katalog" | "google";
  rating: number | null;
  ratingCount: number | null;
  /** Det som skickas vidare för att bygga profilen: webbadressen, annars org.nr. Null när inget av dem finns. */
  buildFrom: string | null;
}

export const MAX_CANDIDATES = 5;
export const MIN_QUERY = 3;

interface CatalogRow {
  name: string | null;
  orgnr: string | null;
  domain: string | null;
  city: string | null;
}

const candidateOf = (c: Omit<Candidate, "key" | "buildFrom">): Candidate => ({
  ...c,
  key: c.domain ?? c.orgnr ?? `${c.name}|${c.city ?? ""}`.toLowerCase(),
  buildFrom: c.domain ?? c.orgnr,
});

/** Katalogens träffar före Googles, utan dubbletter på domän, org.nr eller namn och ort. Ren. */
export function mergeCandidates(catalog: CatalogRow[], places: PlaceHit[], limit = MAX_CANDIDATES): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (c: Candidate) => {
    const keys = [c.domain && `d:${c.domain}`, c.orgnr && `o:${c.orgnr}`, `n:${c.name.toLowerCase()}|${(c.city ?? "").toLowerCase()}`].filter((k): k is string => !!k);
    if (keys.some((k) => seen.has(k))) return;
    keys.forEach((k) => seen.add(k));
    out.push(c);
  };
  for (const r of catalog) if (r.name) add(candidateOf({ name: r.name, city: r.city, domain: normalizeDomain(r.domain), orgnr: r.orgnr, source: "katalog", rating: null, ratingCount: null }));
  for (const p of places) add(candidateOf({ name: p.name, city: cityOf(p.address), domain: p.domain, orgnr: null, source: "google", rating: p.rating ?? null, ratingCount: p.ratingCount ?? null }));
  return out.slice(0, limit);
}

/** Orten ur en adress som Google skriver den: "Storgatan 1, 211 11 Malmö, Sverige" -> "Malmö". Ren. */
export function cityOf(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((s) => s.trim()).filter((s) => s && !/^sverige$/i.test(s));
  const last = parts.at(-1) ?? null;
  return last ? last.replace(/^\d{3}\s?\d{2}\s+/, "") || null : null;
}

export interface NameSearchDeps {
  catalog: (needle: string, limit: number) => Promise<CatalogRow[]>;
  places: (query: string, limit: number) => Promise<PlaceHit[]>;
  placesConfigured: () => boolean;
}

export const defaultNameSearchDeps: NameSearchDeps = {
  async catalog(needle, limit) {
    const { rows } = await pool.query(
      `select c.name, c.orgnr, c.domain, c.registry->'organisation'->'address'->>'city' as city
       from companies c where c.search_text like $1 order by c.name nulls last limit $2`,
      [needle, limit],
    );
    return rows as CatalogRow[];
  },
  places: (query, limit) => searchPlaces(query, limit),
  placesConfigured: isPlacesConfigured,
};

/** Kandidater för ett namn. Ett fel i en av källorna ger bara färre träffar. */
export async function searchCompanies(query: string, deps: NameSearchDeps = defaultNameSearchDeps): Promise<Candidate[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];
  const needle = buildSearchNeedle(q);
  const [catalog, places] = await Promise.all([
    needle ? deps.catalog(needle, MAX_CANDIDATES).catch(() => [] as CatalogRow[]) : Promise.resolve([] as CatalogRow[]),
    deps.placesConfigured() ? deps.places(q, MAX_CANDIDATES).catch(() => [] as PlaceHit[]) : Promise.resolve([] as PlaceHit[]),
  ]);
  return mergeCandidates(catalog, places);
}
