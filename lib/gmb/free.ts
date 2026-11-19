import { randomUUID } from "node:crypto";
import { ENDPOINT } from "@/lib/scrapers/googleplaces";
import { classifyPlaces, isPlaceholderPhone, siteLinksGoogleProfile, type GmbResult, type RawPlace } from "./check";

// Kontrollen av Google-profil helt utan Googles betalda nivåer. Fyra delar, alla utan avgift enligt Googles prislista:
//
//   1. Autocomplete i en session (ger namn och adress på träffarna), som avslutas med ett Place Details-anrop som bara ber om
//      id (Place Details Essentials, IDs Only: obegränsat gratis). En session som avslutas så faktureras inte för själva
//      autocompleten.
//   2. Textsökning som bara ber om id (Text Search Essentials, IDs Only: obegränsat gratis) på telefonnumret. Siffror är exakta,
//      så en träff betyder nästan alltid att numret finns på en profil.
//   3. Samma sökning på webbadressen. Google matchar löst och ger ofta en träff på ett ord som liknar domänen, så en träff
//      där betyder bara "osäkert", aldrig "har".
//   4. Företagets egen startsida: länkar den till sin Google-profil har företaget en.
//
// Fältmasken i id-anropen får bara innehålla `places.id` / `id`. Allt annat hamnar på en betald nivå. Ett hårt tak i databasen
// (places-autocomplete) håller antalet autocompleteanrop under de 10 000 gratis i månaden även om faktureringen mot förmodan
// skulle räkna dem.

const AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";

export interface FreeDeps {
  autocomplete: (query: string, session: string) => Promise<RawPlace[] | null>;
  closeSession: (placeId: string, session: string) => Promise<void>;
  ids: (query: string) => Promise<string[] | null>;
  homepage: (domain: string) => Promise<string | null>;
}

export const defaultFreeDeps = (apiKey: string | undefined = process.env.GOOGLE_PLACES_API_KEY, f: typeof fetch = globalThis.fetch): Pick<FreeDeps, "autocomplete" | "closeSession" | "ids"> => ({
  async autocomplete(input, session) {
    if (!apiKey) return null;
    try {
      const r = await f(AUTOCOMPLETE, { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey }, body: JSON.stringify({ input, sessionToken: session, languageCode: "sv", regionCode: "SE", includedRegionCodes: ["se"] }), signal: AbortSignal.timeout(12_000) });
      if (!r.ok) return null;
      const d = (await r.json()) as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string } } } }[] };
      return (d.suggestions ?? []).flatMap((s) => (s.placePrediction?.placeId ? [{ id: s.placePrediction.placeId, displayName: { text: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? "" }, formattedAddress: s.placePrediction.text?.text ?? "" } as RawPlace] : []));
    } catch {
      return null;
    }
  },
  async closeSession(placeId, session) {
    if (!apiKey) return;
    // Bara id: den kostnadsfria nivån. Avslutar sessionen så att autocompleten inte faktureras.
    await f(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(session)}`, { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id" }, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  },
  async ids(query) {
    if (!apiKey) return null;
    try {
      const r = await f(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id" }, body: JSON.stringify({ textQuery: query, regionCode: "SE", languageCode: "sv", pageSize: 10 }), signal: AbortSignal.timeout(12_000) });
      if (!r.ok) return null;
      return (((await r.json()) as { places?: { id?: string }[] }).places ?? []).map((p) => p.id!).filter(Boolean);
    } catch {
      return null;
    }
  },
});

const nationalPhone = (p: string) => p.replace(/^\+46/, "0").replace(/\D/g, "");

/**
 * Kontrollerar ett företag utan betalda anrop. Null när autocompleten felade (då sparas inget och företaget tas om senare).
 * Hellre "osäker" än "saknar": en träff på webbadressen utan namn, eller ett fel i någon av sökningarna, ger "osäker".
 */
export async function checkCompanyFree(c: { name: string; city?: string | null; domain?: string | null; phone?: string | null }, deps: FreeDeps): Promise<GmbResult | null> {
  const query = c.city ? `${c.name} ${c.city}` : c.name;
  const session = randomUUID();
  const preds = await deps.autocomplete(query, session);
  if (preds === null) return null;
  if (preds.length > 0 && preds[0].id) await deps.closeSession(preds[0].id, session);

  const verdict = classifyPlaces(preds, { name: c.name, city: c.city, domain: c.domain });
  if (verdict.state === "has" || verdict.state === "closed") {
    return { state: verdict.state, via: "autocomplete", placeId: verdict.place?.id ?? null, placeName: verdict.place?.displayName?.text ?? null, mapsUrl: null, query };
  }
  if (c.domain) {
    const html = await deps.homepage(c.domain).catch(() => null);
    const link = html ? siteLinksGoogleProfile(html) : null;
    if (link) return { state: "has", via: "site-link", placeId: null, placeName: null, mapsUrl: link, query };
  }
  // Ett nummer som finns på en profil: exakt, så det räknas som att företaget har en (eller delar nummer med en som har).
  if (c.phone && !isPlaceholderPhone(c.phone)) {
    const byPhone = await deps.ids(nationalPhone(c.phone));
    if (byPhone && byPhone.length > 0) return { state: "has", via: "phone", placeId: byPhone[0], placeName: null, mapsUrl: null, query };
    if (byPhone === null) return { state: "unsure", via: "phone", placeId: null, placeName: null, mapsUrl: null, query };
  }
  // En träff på webbadressen är oftast bara ett liknande ord, men kan vara företagets profil: aldrig "saknar" då.
  if (c.domain) {
    const byDomain = await deps.ids(c.domain);
    if (byDomain === null || (byDomain.length >= 1 && byDomain.length <= 3)) return { state: "unsure", via: "website-id", placeId: byDomain?.[0] ?? null, placeName: null, mapsUrl: null, query };
  }
  return { state: verdict.state, via: "autocomplete", placeId: null, placeName: null, mapsUrl: null, query };
}
