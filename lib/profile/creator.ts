import { normalizeDomain } from "@/lib/scrapers/domain";
import { decodeEntities } from "@/lib/enrich/extract";
import { withinBoundary } from "./safe-url";

// Byrån bakom en webbplats, med länk. `findCredit` (lib/enrich/audit.ts) arbetar på text efter att taggarna
// tagits bort och tappar därför länken. Här söks kreditfrasen i rå HTML, i sidfoten när det finns en, och
// länken till byrån tas ur samma ställe. Ren och testad.

export interface Creator {
  name: string;
  url: string | null;
  domain: string | null;
}

// Två slags kreditfraser. "Skapad av" och liknande pekar ut en byrå. "Powered by" och "drivs av" pekar oftast ut en
// plattform eller ett verktyg, och är bara en byrå när inget annat visar motsatsen.
// Substantiv i kreditrader som "Design / Utveckling av ARLY" eller "Webbdesign & produktion av X". De som inte är rena
// designord (utveckling, produktion ...) kan också stå i vanlig text ("utveckling av bostäder") och får därför en
// snävare gräns för hur nära länken ska ligga, se NOUN_ONLY.
const NOUN = String.raw`(?:web[a-zåäö]*\s*)?(?:design|seo|utveckling|produktion|programmering|koncept|idé|teknik|lösning|sökmotoroptimering|marknadsföring)`;
const MADE_BY = String.raw`(?:skapad|gjord|utvecklad|producerad|byggd|designad|levererad)\s+(?:med\s+\S{1,4}\s+)?av|${NOUN}(?:\s*(?:/|&amp;|&|\+|och|,)\s*${NOUN})*\s+av|hemsida\s+av|webbplats\s+av|sajt\s+av|webbyrå\s*:?|webbbyrå\s*:?`;
const NOUN_ONLY = /utveckling|produktion|programmering|koncept|idé|teknik|lösning|sökmotoroptimering|marknadsföring/i;
/** Hur nära efter en substantivfras länken måste börja, i tecken. */
const NOUN_WINDOW = 6;
const POWERED_BY = String.raw`powered\s+by|(?:driven|drivs)\s+av|by`;
const PHRASE = new RegExp(`\\b(?:${MADE_BY}|${POWERED_BY})\\s+`, "gi");
const MADE_BY_RE = new RegExp(`^(?:${MADE_BY})\\s*$`, "i");
/** Länkar som själva säger att de är en "powered by"-länk, oavsett vad texten säger. */
const POWERED_BY_LINK = /[?&]utm_[a-z]+=power(?:ed)?-?by\b|[?&]utm_campaign=[^&]*power(?:ed)?-?by/i;
const TOOL_NAME = /^(wordpress|wix|squarespace|shopify|webflow|joomla|drupal|elementor|jimdo|weebly|one\.com|woocommerce|divi|google|meta|facebook)\b/i;
const TOOL_DOMAIN = /(?:^|\.)(?:wordpress\.org|wordpress\.com|wix\.com|squarespace\.com|shopify\.com|webflow\.com|elementor\.com|jimdo\.com|weebly\.com|one\.com|google\.[a-z.]+|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|apple\.com|gstatic\.com|schema\.org)$/i;
const WINDOW = 320;
const FOOTER_WINDOW = 12_000;

const strip = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Sidfoten: från det sista <footer> och framåt, annars slutet av sidan. Skript och stilar tas bort först. Utan det kan
 * en sida utan <footer> ha så mycket skript efter kreditraden att raden hamnar utanför fönstret (esosbygg.se: 24 000
 * tecken skript efter "SEO av Webb of Sweden"). Ren.
 */
export function footerRegion(html: string): string {
  const clean = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  const footerAt = clean.toLowerCase().lastIndexOf("<footer");
  return footerAt >= 0 ? clean.slice(footerAt) : clean.slice(Math.max(0, clean.length - FOOTER_WINDOW));
}

function cleanName(raw: string): string | null {
  const name = raw.replace(/^[\s:–—\-|·•©❤♥]+|[\s.,;:|·•–—\-]+$/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60 || TOOL_NAME.test(name) || /^(oss|dig|er|vårt|team|företag)$/i.test(name)) return null;
  return name;
}

interface Anchor {
  start: number;
  end: number;
  href: string;
  text: string;
  imgLabel: string | null;
}

function anchorsIn(region: string): Anchor[] {
  const out: Anchor[] = [];
  for (const m of region.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const inner = m[2];
    const img = /<img\b[^>]*>/i.exec(inner)?.[0] ?? "";
    const label = /\b(?:alt|title)\s*=\s*["']([^"']+)["']/i.exec(img)?.[1] ?? null;
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, href: decodeEntities(m[1]).trim(), text: strip(inner), imgLabel: label ? decodeEntities(label).trim() : null });
  }
  return out;
}

function externalUrl(href: string, siteDomain: string): { url: string; domain: string } | null {
  let url: URL;
  try {
    url = new URL(href.startsWith("//") ? `https:${href}` : href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const domain = normalizeDomain(url.toString());
  if (!domain || withinBoundary(domain, siteDomain) || TOOL_DOMAIN.test(domain)) return null;
  return { url: `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`, domain };
}

export type CreditPhrase = "made-by" | "powered-by";

/** En kredit i sidfoten: vem, med vilken fras, och om det som pekas ut är en känd plattform i stället för en byrå. */
export interface Credit extends Creator {
  phrase: CreditPhrase;
  /** Känd plattform eller en länk märkt "powered by": en teknik, inte en byrå. */
  platform: boolean;
}

/** Namnet utan kreditfrasen i början ("Powered by Snowfire" -> "Snowfire"). Null när inget namn blir kvar. */
export function stripPhrase(raw: string): string | null {
  const stripped = raw.replace(PHRASE, " ");
  PHRASE.lastIndex = 0;
  return cleanName(stripped);
}

function creditsIn(region: string, siteDomain: string, isPlatform: (domain: string) => boolean): Credit[] {
  const anchors = anchorsIn(region);
  const out: Credit[] = [];
  const seen = new Set<string>();

  for (const m of region.matchAll(PHRASE)) {
    const at = m.index ?? 0;
    const phraseEnd = at + m[0].length;
    // En länk som innehåller frasen, eller den första länken strax efter den.
    const containing = anchors.find((a) => a.start <= at && a.end >= phraseEnd);
    const next = anchors.find((a) => a.start >= phraseEnd - 1 && a.start - phraseEnd <= (NOUN_ONLY.test(m[0]) ? NOUN_WINDOW : WINDOW));
    const anchor = containing ?? next;
    if (!anchor) continue;
    const ext = externalUrl(anchor.href, siteDomain);
    if (!ext) continue;
    // Frasen kan stå i en alt-text inuti länken: den som matchar ska ge fras, inte namn.
    const phrase: CreditPhrase = MADE_BY_RE.test(m[0].trim()) ? "made-by" : "powered-by";

    let name: string | null = null;
    if (containing) {
      const after = anchor.text.slice(Math.max(0, anchor.text.search(/\S/)));
      const cut = PHRASE.exec(after);
      PHRASE.lastIndex = 0;
      name = cleanName(cut ? after.slice(cut.index + cut[0].length) : after);
    }
    if (!name) name = stripPhrase(anchor.text) ?? (anchor.imgLabel ? stripPhrase(anchor.imgLabel) : null);
    // Bara en bild som länk: välj namnet ur alt, annars domänen utan ändelse.
    if (!name) name = cleanName(ext.domain.replace(/\.[a-z]{2,}$/i, ""));
    if (!name || seen.has(ext.domain)) continue;
    seen.add(ext.domain);
    out.push({ name, url: ext.url, domain: ext.domain, phrase, platform: isPlatform(ext.domain) || POWERED_BY_LINK.test(anchor.href) });
  }
  return out;
}

/** Sidfotens text (sist i dokumentet om det saknas en sidfot), som underlag när en kredit ska bedömas. */
export function footerText(html: string, max = 1500): string {
  return strip(footerRegion(html)).slice(0, max);
}

export interface FooterLink {
  url: string;
  domain: string;
  text: string;
}

/**
 * Sidfotens externa länkar (utan sajtens egna, sociala medier och verktyg), med länktext eller bildens alt. Underlag när
 * en AI ska avgöra vem som byggt sajten och reglerna inte hittat en kredit. Högst `max`, en per domän. Ren.
 */
export function footerExternalLinks(html: string, siteDomain: string, max = 12): FooterLink[] {
  const region = footerRegion(html);
  const out: FooterLink[] = [];
  const seen = new Set<string>();
  for (const a of anchorsIn(region)) {
    const ext = externalUrl(a.href, siteDomain);
    if (!ext || seen.has(ext.domain)) continue;
    seen.add(ext.domain);
    out.push({ url: ext.url, domain: ext.domain, text: (a.text || a.imgLabel || "").slice(0, 80) });
    if (out.length >= max) break;
  }
  return out;
}

export interface FooterCredits {
  /** Byrån som sidan pekar ut, eller null. Ett "powered by" som inte är en känd plattform räknas bara när inget annat finns. */
  agency: (Creator & { phrase: CreditPhrase }) | null;
  /** Plattformar som sidfoten pekar ut: tekniken sajten körs på, inte byrån som byggt den. */
  platforms: Creator[];
}

/**
 * Allt sidfoten säger om vem som står bakom sajten, sorterat: byråer ("skapad av") före "powered by", och kända
 * plattformar (eller länkar märkta "powered by") hålls utanför byrån och returneras för sig. `siteIsPlatform` pekar
 * ut kända plattformsdomäner. `fallbackName` är namnet `auditSite` hittat, som används när ingen länk kunde kopplas.
 */
export function findFooterCredits(html: string, siteDomain: string, fallbackName?: string | null, siteIsPlatform: (domain: string) => boolean = () => false): FooterCredits {
  const credits = creditsIn(footerRegion(html), siteDomain, siteIsPlatform);

  const platforms = credits.filter((c) => c.platform).map(({ name, url, domain }) => ({ name, url, domain }));
  const agencies = credits.filter((c) => !c.platform);
  const pick = agencies.find((c) => c.phrase === "made-by") ?? agencies[0] ?? null;
  if (pick) return { agency: { name: pick.name, url: pick.url, domain: pick.domain, phrase: pick.phrase }, platforms };

  const fallback = fallbackName ? stripPhrase(fallbackName) : null;
  return { agency: fallback ? { name: fallback, url: null, domain: null, phrase: "made-by" } : null, platforms };
}

/**
 * Byrån som sidans kredit pekar ut. Söker i sidfoten (sist i dokumentet om det saknas), tar länken som hör till
 * frasen och namnet ur länkens text eller bildens alt. Se `findFooterCredits` för plattformarna.
 */
export function findCreator(html: string, siteDomain: string, fallbackName?: string | null, siteIsPlatform?: (domain: string) => boolean): Creator | null {
  const { agency } = findFooterCredits(html, siteDomain, fallbackName, siteIsPlatform);
  return agency ? { name: agency.name, url: agency.url, domain: agency.domain } : null;
}

const GENERIC_TAIL = new Set(["webb", "webbyrå", "webbbyrå", "webbdesign", "digital", "digitalbyrå", "media", "reklam", "reklambyrå", "design", "byrå", "ab", "i", "sverige"]);

/** Byråns kärnnamn, för att känna igen "Conseo Webb" som "Conseo". Tar bort allmänna ändelser men aldrig hela namnet. */
export function agencyKey(name: string): string {
  const words = name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  while (words.length > 1 && GENERIC_TAIL.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}
