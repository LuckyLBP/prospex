import { ENDPOINT } from "@/lib/scrapers/googleplaces";
import { nameMatches, nameTokens } from "@/lib/profile/places";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";

// Har företaget en Google-profil? En sökning på Google Places (Pro-nivån: namn, adress och status, 5 000 gratis i månaden)
// och, när den inte ger en träff, en titt på företagets egen startsida efter en länk till profilen. Hellre "har" än
// "saknar": en felaktig "saknar" ger ett felaktigt lead, så allt som ser ut som en träff räknas som en.

export type GmbState = "has" | "closed" | "none" | "unsure";

export interface RawPlace {
  id?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: string;
  googleMapsUri?: string;
}

/** Pro-nivån: inga telefonnummer eller webbadresser (de ger Enterprise-nivån, med bara 1 000 gratis). */
export const PRO_FIELD_MASK = ["places.id", "places.displayName", "places.formattedAddress", "places.businessStatus", "places.googleMapsUri"].join(",");

/** Enterprise-nivån: med webbadress och telefon, vilket är det säkraste beviset på att en träff är just det här företaget. */
export const ENT_FIELD_MASK = [PRO_FIELD_MASK, "places.websiteUri", "places.nationalPhoneNumber"].join(",");

const fold = (s: string) => s.toLowerCase().replace(/å|ä/g, "a").replace(/ö/g, "o").replace(/é/g, "e").replace(/[^a-z0-9]+/g, " ").trim();

/** Domänens första led utan ändelse: "freshup.se" -> "freshup". Ren. */
export function domainLabel(domain: string | null | undefined): string | null {
  const d = (domain ?? "").toLowerCase().replace(/^www\./, "");
  const label = d.split(".")[0] ?? "";
  const folded = fold(label).replace(/ /g, "");
  return folded.length >= 4 ? folded : null;
}

const joined = (name: string) => nameTokens(name).join("");

/** Vanliga ord i branschnamn: som domän säger de inget om vilket företag det är ("bygg.se", "frisor.se"). */
const GENERIC_LABELS = new Set(["bygg", "byggfirma", "byggservice", "el", "elektriker", "elservice", "vvs", "stad", "stadning", "flytt", "malaren", "maleri", "frisor", "frisorer", "salong", "restaurang", "restaurangen", "cafe", "kafe", "hotell", "taxi", "bil", "bilar", "verkstad", "bilverkstad", "redovisning", "ekonomi", "juridik", "konsult", "konsulten", "service", "tjanster", "teknik", "design", "webb", "media", "marknad", "trafik", "massage", "hudvard", "klinik", "tandlakare", "advokat", "fastighet", "mäkleri", "makleri", "transport", "entreprenad", "rormokare", "snickare", "tradgard", "hemstad", "kontor", "butik"]);

/**
 * Är det här träffens namn samma företag? Först samma regel som resten av systemet (nameMatches). Därefter två sätt att
 * hantera namn som skiljer sig i form: samma tecken utan mellanslag ("LennartsBilel AB" och "Lennarts Bilel AB"), och
 * företagets egen domän som stöd: heter företaget som domänen ("Freshup", freshup.se) räcker det att träffens namn börjar med
 * eller innehåller ordet, och ett längre domännamn räcker som delsträng i träffens namn. Googles namn är ofta längre och
 * fulla av sökord ("Carmag AB | Bygg, trädgård & bevattning"), så strikt namnjämförelse missar många. Ren.
 */
export function placeNameMatches(company: { name: string; domain?: string | null }, placeName: string): boolean {
  if (nameMatches(company.name, placeName)) return true;
  const a = joined(company.name);
  const b = joined(placeName);
  if (a && a === b) return true;
  // Ett långt, ovanligt ensamt ord ("FöretagsEkonomerna") som är första ordet i träffens namn.
  const first = nameTokens(placeName)[0] ?? "";
  if (nameTokens(company.name).length === 1 && a.length >= 8 && first === a && !GENERIC_LABELS.has(a) && !COMMON_WORDS.has(a)) return true;
  const label = domainLabel(company.domain);
  if (!label || !b || GENERIC_LABELS.has(label)) return false;
  // Företaget heter som domänen: träffens namn ska börja med eller innehålla det.
  if (a === label || a.startsWith(label) || (label.startsWith(a) && a.length >= 4)) return b.startsWith(label) || b.includes(label);
  // Annars krävs ett längre domännamn som står i träffens namn.
  return label.length >= 6 && b.includes(label);
}

/** Ord som inte skiljer ett företag från ett annat, så att en träff som bara delar dem inte räknas som lik. */
const COMMON_WORDS = new Set(["bygg", "service", "teknik", "design", "group", "sverige", "svenska", "nordic", "consulting", "konsult", "ekonomi", "redovisning", "restaurang", "hotell", "taxi", "bil", "verkstad", "frisor", "salong", "massage", "klinik", "fastighet", "fastigheter", "entreprenad", "transport", "media", "webb", "marknadsforing", "trading", "partner", "solutions", "systems", "holding", "invest", "management", "forvaltning", "tjanster", "stad", "stadning", "flytt", "maleri", "elektriker", "elservice", "rormokare", "snickeri"]);

/** Ett telefonnummer som ser ut som ett exempel eller en plats att fylla i (070-123 45 67, 000 00 00)? Ren. */
export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  const d = (phone ?? "").replace(/\D/g, "");
  return /1234567|7654321|0000000|1111111|2222222|3333333|9999999/.test(d);
}

/**
 * Ser det ut som ett företagsnamn, och inte som en sidtitel, en beskrivning, en standardtitel från en sajtbyggare
 * ("My Site", "My Vxw Site Uuq0wt") eller bara webbadressen? `domain` hjälper att avgöra det sista. Ren.
 */
export function looksLikeBusinessName(name: string, domain?: string | null): boolean {
  const n = name.trim();
  if (n.length < 3 || n.length > 70) return false;
  if (/^(my\s+(vxw\s+)?site|mysite|min\s+(hemsida|webbplats|sida)|hemsida|webbplats|startsida|home|hem|welcome|untitled|new\s+site|ny\s+sida|under\s+(construction|uppbyggnad)|coming\s+soon|wix|wordpress)\b/i.test(n)) return false;
  // Namnet är webbadressen ("hbb.se", "lifemusic.se"): då vet vi inte vad företaget heter.
  if (/\.(se|com|nu|net|org|eu|dk|no|fi)$/i.test(n)) return false;
  const label = domainLabel(domain);
  if (label && fold(n).replace(/ /g, "") === label && n.split(/\s+/).length === 1 && n === n.toLowerCase()) return false;
  if (/[,;:|!?]/.test(n)) return false;
  const words = n.split(/\s+/);
  if (words.length > 6) return false;
  const tokens = nameTokens(n);
  if (tokens.length === 0) return false;
  // Ett enda vanligt branschord ("Taxi", "Bygg") är ingen identitet.
  if (tokens.length === 1 && (COMMON_WORDS.has(tokens[0]) || GENERIC_LABELS.has(tokens[0]))) return false;
  // Beskrivande inledningar: "Din ...", "Webbyrå med ...", "Bästa ...", "... i Göteborg".
  if (/^(din|ditt|dina|din lokala|bästa|valkommen|välkommen|webbyrå|hitta|vi |hos |er )\b/i.test(n)) return false;
  if (/\b(med|för|från|och)\b.+\bi\s+[A-ZÅÄÖ]/.test(n) && words.length >= 4) return false;
  return true;
}

/** Delar någon träff ett utmärkande ord (minst fyra tecken, inte ett vanligt branschord) med företagets namn? Då är "ingen träff" osäkert. Ren. */
export function placesResembleCompany(places: readonly RawPlace[], companyName: string): boolean {
  const mine = nameTokens(companyName).filter((t) => t.length >= 4 && !COMMON_WORDS.has(t) && !GENERIC_LABELS.has(t));
  if (mine.length === 0) return false;
  return places.some((p) => {
    const theirs = new Set(nameTokens(p.displayName?.text ?? ""));
    return mine.some((t) => theirs.has(t) || [...theirs].some((x) => x.length >= 5 && (x.startsWith(t) || t.startsWith(x))));
  });
}

export interface CompanyKey {
  name: string;
  domain?: string | null;
  /** Orten, när den är känd (registret, en profil). Utan den räcker namnet. */
  city?: string | null;
}

/**
 * Vad träffarna säger om företaget. En träff räknas när namnet stämmer (nameMatches) och, om orten är känd och träffen har en
 * adress, adressen nämner orten. Är den enda träffen permanent stängd är företaget troligen nedlagt. Ren.
 */
export function classifyPlaces(places: readonly RawPlace[], company: CompanyKey): { state: "has" | "closed" | "none" | "unsure"; place: RawPlace | null } {
  const city = company.city ? fold(company.city) : null;
  const matching = places.filter((p) => {
    if (!p.displayName?.text || !placeNameMatches(company, p.displayName.text)) return false;
    if (city && p.formattedAddress && !fold(p.formattedAddress).includes(city)) return false;
    return true;
  });
  const open = matching.find((p) => p.businessStatus !== "CLOSED_PERMANENTLY");
  if (open) return { state: "has", place: open };
  if (matching.length > 0) return { state: "closed", place: matching[0] };
  // Ingen träff med rätt namn. "Saknar" säger vi bara när namnet ser ut som ett företagsnamn och inget liknar det.
  if (!looksLikeBusinessName(company.name, company.domain) || placesResembleCompany(places, company.name)) return { state: "unsure", place: null };
  return { state: "none", place: null };
}

/** Länkar företagets egen sida till sin Google-profil? Då har företaget en, hur den än heter. Ren. */
export function siteLinksGoogleProfile(html: string): string | null {
  const patterns: RegExp[] = [
    /https?:\/\/g\.page\/[A-Za-z0-9_\-/]+/,
    /https?:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9]+/,
    /https?:\/\/g\.co\/kgs\/[A-Za-z0-9]+/,
    /https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/place\/[^"'\s<>]+/,
    /https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\?[^"'\s<>]*\bcid=\d+/,
    /https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/(?:reviews|contrib)\/[^"'\s<>]+/,
    /https?:\/\/search\.google\.com\/local\/(?:reviews|writereview)\?[^"'\s<>]*placeid=[A-Za-z0-9_-]+/,
    /https?:\/\/business\.google\.com\/[^"'\s<>]+/,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[0].slice(0, 200);
  }
  return null;
}

export interface GmbDeps {
  fetch: typeof globalThis.fetch;
  apiKey: string | undefined;
}
export const defaultGmbDeps = (): GmbDeps => ({ fetch: globalThis.fetch, apiKey: process.env.GOOGLE_PLACES_API_KEY });

/** En sökning på Google Places. Null vid fel (då kontrolleras företaget om senare, det blir aldrig "saknar" av ett fel). */
export async function searchPro(query: string, deps: GmbDeps = defaultGmbDeps()): Promise<RawPlace[] | null> {
  return searchPlacesRaw(query, PRO_FIELD_MASK, deps);
}

/** Som searchPro men med webbadress och telefon (Enterprise-nivån). Dyrare och med liten gratiskvot: bara för en andra titt. */
export async function searchEnterprise(query: string, deps: GmbDeps = defaultGmbDeps()): Promise<RawPlace[] | null> {
  return searchPlacesRaw(query, ENT_FIELD_MASK, deps);
}

async function searchPlacesRaw(query: string, mask: string, deps: GmbDeps): Promise<RawPlace[] | null> {
  if (!deps.apiKey) return null;
  try {
    const r = await deps.fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": deps.apiKey, "X-Goog-FieldMask": mask },
      body: JSON.stringify({ textQuery: query, regionCode: "SE", languageCode: "sv", pageSize: 5 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { places?: RawPlace[] }).places ?? [];
  } catch {
    return null;
  }
}

/**
 * Är någon träff just det här företaget enligt webbadress eller telefon? Samma domän, eller samma telefonnummer. Ren.
 * Beviset är starkare än ett namn och avgör även när Google har ett helt annat namn på profilen.
 */
export function placeIsCompany(places: readonly RawPlace[], company: { domain?: string | null; phone?: string | null }): { place: RawPlace; by: "website" | "phone" } | null {
  const domain = company.domain ? normalizeDomain(company.domain) : null;
  const phone = company.phone ? normalizeSwedishPhone(company.phone) : null;
  for (const p of places) {
    if (p.businessStatus === "CLOSED_PERMANENTLY") continue;
    if (domain && normalizeDomain(p.websiteUri) === domain) return { place: p, by: "website" };
    if (phone && normalizeSwedishPhone(p.nationalPhoneNumber) === phone) return { place: p, by: "phone" };
  }
  return null;
}

export interface GmbResult {
  state: GmbState;
  via: "places" | "site-link" | "website" | "phone";
  placeId: string | null;
  placeName: string | null;
  mapsUrl: string | null;
  query: string;
}

export interface CheckDeps {
  search: (query: string) => Promise<RawPlace[] | null>;
  /** Den andra titten med webbadress och telefon. Saknas den hoppas steget över. Null = kvoten är slut eller anropet felade. */
  confirm?: (query: string) => Promise<RawPlace[] | null>;
  /** Startsidans källkod, eller null. Bara när sökningen inte gav en träff. */
  homepage: (domain: string) => Promise<string | null>;
}

/**
 * Kontrollerar ett företag. Null när sökningen felade: inget sparas, och företaget tas om senare. Ingen träff på Google ger
 * en titt på företagets egen startsida; länkar den till en Google-profil räknas företaget som att det har en.
 */
export async function checkCompany(c: { name: string; city?: string | null; domain?: string | null; phone?: string | null }, deps: CheckDeps): Promise<GmbResult | null> {
  const query = c.city ? `${c.name} ${c.city}` : c.name;
  const places = await deps.search(query);
  if (places === null) return null;
  const verdict = classifyPlaces(places, { name: c.name, city: c.city, domain: c.domain });
  if (verdict.state === "has" || verdict.state === "closed") {
    return { state: verdict.state, via: "places", placeId: verdict.place?.id ?? null, placeName: verdict.place?.displayName?.text ?? null, mapsUrl: verdict.place?.googleMapsUri ?? null, query };
  }
  if (c.domain) {
    const html = await deps.homepage(c.domain).catch(() => null);
    const link = html ? siteLinksGoogleProfile(html) : null;
    if (link) return { state: "has", via: "site-link", placeId: null, placeName: null, mapsUrl: link, query };
  }
  // Ser det fortfarande ut som att profilen saknas: en andra titt på träffarnas webbadress och telefon, som är säkrare än namnet.
  if (verdict.state === "none" && deps.confirm && (c.domain || c.phone)) {
    const detailed = await deps.confirm(query).catch(() => null);
    const proven = detailed ? placeIsCompany(detailed, c) : null;
    if (proven) return { state: "has", via: proven.by, placeId: proven.place.id ?? null, placeName: proven.place.displayName?.text ?? null, mapsUrl: proven.place.googleMapsUri ?? null, query };
    // Kvoten slut eller anropet felade: osäkert hellre än "saknar".
    if (detailed === null) return { state: "unsure", via: "places", placeId: null, placeName: null, mapsUrl: null, query };
  }
  return { state: verdict.state, via: "places", placeId: null, placeName: null, mapsUrl: null, query };
}
