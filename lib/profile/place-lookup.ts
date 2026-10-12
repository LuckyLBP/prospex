import { pool } from "@/lib/db";
import type { FactBook } from "./facts";
import { findWebsiteByName, isPlacesConfigured, type PlaceHit } from "./places";

// Googles uppgifter om företaget (betyg, öppettider, kategori) för varje profil, inte bara när webbplatsen ska letas
// upp. Svaret sparas på företaget i 30 dagar (en miss i 7), eftersom kvoten delas med insamlingen. Ett fel ger
// "ingen träff", aldrig ett misslyckat bygge.

export const PLACE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PLACE_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlaceCache {
  hit: PlaceHit | null;
}

export interface PlaceLookupDeps {
  configured: () => boolean;
  find: typeof findWebsiteByName;
  read: (companyId: string) => Promise<{ value: PlaceCache | null; fetchedAt: Date | null }>;
  write: (companyId: string, value: PlaceCache) => Promise<void>;
  now: () => number;
}

export const defaultPlaceDeps: PlaceLookupDeps = {
  configured: isPlacesConfigured,
  find: findWebsiteByName,
  async read(companyId) {
    const { rows } = await pool.query(`select places, places_fetched_at from companies where id = $1`, [companyId]);
    return { value: (rows[0]?.places as PlaceCache | null) ?? null, fetchedAt: rows[0]?.places_fetched_at ? new Date(rows[0].places_fetched_at) : null };
  },
  async write(companyId, value) {
    await pool.query(`update companies set places = $2::jsonb, places_fetched_at = now() where id = $1`, [companyId, JSON.stringify(value)]);
  },
  now: Date.now,
};

/** Är det sparade svaret färskt nog att användas? Ren. */
export function placeCacheFresh(cache: { value: PlaceCache | null; fetchedAt: Date | null }, now: number): boolean {
  if (!cache.value || !cache.fetchedAt) return false;
  const age = now - cache.fetchedAt.getTime();
  return age < (cache.value.hit ? PLACE_TTL_MS : PLACE_MISS_TTL_MS);
}

/**
 * Googles träff för företaget. `known` är en träff som resolve redan gjort, och används utan nytt anrop när den har
 * betyg eller öppettider (annars är det en träff från före de fälten togs med).
 */
export async function lookupPlace(
  i: { companyId: string | null; name: string | null; city: string | null; domain: string | null; known: PlaceHit | null },
  deps: PlaceLookupDeps = defaultPlaceDeps,
): Promise<PlaceHit | null> {
  if (i.known && (i.known.rating !== undefined || i.known.hours !== undefined)) return i.known;
  if (!deps.configured() || (!i.name && !i.domain)) return i.known;
  try {
    if (i.companyId) {
      const cached = await deps.read(i.companyId).catch(() => ({ value: null, fetchedAt: null }));
      if (placeCacheFresh(cached, deps.now())) return cached.value!.hit;
    }
    // Utan registernamn söks på domänen, och bara en träff med den domänen godtas.
    const hit = await deps.find(i.name ?? i.domain!, i.city, undefined, i.domain);
    if (i.companyId) await deps.write(i.companyId, { hit }).catch(() => {});
    return hit ?? i.known;
  } catch {
    return i.known;
  }
}

const stars = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Googles uppgifter som fakta som modellen kan hänvisa till. Ren. */
export function placeFacts(book: FactBook, place: PlaceHit | null): void {
  if (!place) return;
  const src = place.mapsUrl ?? "Google Places";
  const add = (label: string, value: string | null | undefined, detector: string) => value && book.add({ kind: "places", label, value, source: src, detector });
  if (place.rating != null && place.ratingCount) add("Betyg på Google", `${stars(place.rating)} av 5 från ${place.ratingCount.toLocaleString("sv-SE")} omdömen`, "places:rating");
  add("Kategori på Google", place.category, "places:category");
  if (place.hours?.length) add("Öppettider på Google", place.hours.join("; "), "places:hours");
  if (place.status && place.status !== "OPERATIONAL") add("Status på Google", place.status === "CLOSED_TEMPORARILY" ? "Tillfälligt stängt" : place.status, "places:status");
}
