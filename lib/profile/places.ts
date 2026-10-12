import { ENDPOINT } from "@/lib/scrapers/googleplaces";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";

// Hitta ett företags webbplats via Google Places när vi bara har ett namn och en ort (till exempel från
// Bolagsverket). Ett anrop. Fältmasken innehåller webbplats och telefon, vilket ger Enterprise-nivån, vars
// gratis kvot (1 000 anrop i månaden) delas med insamlingen.
//
// En träff godtas bara om namnet stämmer (nameMatches), och även då är den bara trolig tills sajten visat samma
// org.nr (se resolve.ts och gather.ts).

export const isPlacesConfigured = () => !!process.env.GOOGLE_PLACES_API_KEY;

const FIELD_MASK = ["places.id", "places.displayName", "places.formattedAddress", "places.websiteUri", "places.nationalPhoneNumber", "places.googleMapsUri", "places.businessStatus", "places.rating", "places.userRatingCount", "places.regularOpeningHours.weekdayDescriptions", "places.primaryTypeDisplayName"].join(",");

const LEGAL = new Set(["ab", "aktiebolag", "hb", "handelsbolag", "kb", "kommanditbolag", "ek", "for", "ekonomisk", "forening", "publ", "ltd", "oy", "as", "och", "i", "the", "of", "and"]);

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o").replace(/é/g, "e").replace(/ü/g, "u")
    .replace(/&/g, " och ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function nameTokens(name: string): string[] {
  return [...new Set(fold(name).split(/\s+/).filter((t) => t && !LEGAL.has(t)))];
}

/**
 * Är det här samma företag? Samma ord, eller det ena namnet är det andra med fler ord (minst två ord i det
 * kortare). Bolagsformer och "och" räknas inte. Ett enda gemensamt ord räcker inte: "Bygg AB" är inte "Bygg och
 * Måleri AB".
 */
export function nameMatches(registryName: string, placeName: string): boolean {
  const a = nameTokens(registryName);
  const b = nameTokens(placeName);
  if (a.length === 0 || b.length === 0) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(long);
  const contained = short.every((t) => set.has(t));
  if (!contained) return false;
  return short.length === long.length || short.length >= 2;
}

export interface PlaceHit {
  placeId: string | null;
  name: string;
  address: string | null;
  domain: string | null;
  phone: string | null;
  mapsUrl: string | null;
  /** 1 till 5. */
  rating?: number | null;
  ratingCount?: number | null;
  /** En rad per veckodag, som Google skriver dem. */
  hours?: string[];
  category?: string | null;
  status?: string | null;
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  primaryTypeDisplayName?: { text?: string };
}

function toPlaceHit(p: RawPlace): PlaceHit {
  return {
    placeId: p.id ?? null,
    name: p.displayName!.text!,
    address: p.formattedAddress ?? null,
    domain: normalizeDomain(p.websiteUri),
    phone: normalizeSwedishPhone(p.nationalPhoneNumber),
    mapsUrl: p.googleMapsUri ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
    category: p.primaryTypeDisplayName?.text ?? null,
    status: p.businessStatus ?? null,
  };
}

/**
 * Första träffen som inte är permanent stängd och har rätt namn, helst en med webbplats. En träff vars webbplats är
 * företagets egen domän (`siteDomain`) godtas även när namnet skiljer sig, till exempel ett varumärke. Ren.
 */
export function pickPlace(places: RawPlace[], registryName: string | null, siteDomain: string | null = null): PlaceHit | null {
  const hits = places
    .filter((p) => {
      if (!p.displayName?.text || p.businessStatus === "CLOSED_PERMANENTLY") return false;
      if (siteDomain && normalizeDomain(p.websiteUri) === siteDomain) return true;
      return !!registryName && nameMatches(registryName, p.displayName.text);
    })
    .map(toPlaceHit);
  return hits.find((h) => h.domain && h.domain === siteDomain) ?? hits.find((h) => h.domain) ?? hits[0] ?? null;
}

export interface PlacesDeps {
  fetch: typeof globalThis.fetch;
  apiKey?: string | undefined;
}

export async function findWebsiteByName(name: string, city: string | null, deps: PlacesDeps = { fetch: globalThis.fetch, apiKey: process.env.GOOGLE_PLACES_API_KEY }, siteDomain: string | null = null): Promise<PlaceHit | null> {
  if (!deps.apiKey) return null;
  try {
    const response = await deps.fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": deps.apiKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: city ? `${name} ${city}` : name, regionCode: "SE", languageCode: "sv", pageSize: 5 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { places?: RawPlace[] };
    return pickPlace(data.places ?? [], name, siteDomain);
  } catch {
    return null;
  }
}

/** Flera träffar för en fri sökning på namn, utan krav på att namnet stämmer. Tomt vid fel. Används för kandidatlistan. */
export async function searchPlaces(query: string, limit = 5, deps: PlacesDeps = { fetch: globalThis.fetch, apiKey: process.env.GOOGLE_PLACES_API_KEY }): Promise<PlaceHit[]> {
  if (!deps.apiKey) return [];
  try {
    const response = await deps.fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": deps.apiKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: query, regionCode: "SE", languageCode: "sv", pageSize: limit }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { places?: RawPlace[] };
    return (data.places ?? []).filter((p) => p.displayName?.text && p.businessStatus !== "CLOSED_PERMANENTLY").slice(0, limit).map(toPlaceHit);
  } catch {
    return [];
  }
}
