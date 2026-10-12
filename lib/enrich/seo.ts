import { decodeEntities } from "./extract";

/**
 * On-page SEO, read off the home page -- the part of SEO that is visible in the
 * HTML itself and therefore the part a new site would fix. No rankings, no
 * backlinks, no external service: those need a paid index, and they are not
 * what a seller can point at on the phone. "Google vet inte att ni är en
 * frisör i Växjö, för det står ingenstans i koden" is.
 *
 * Pure, like audit.ts. Stored as `site_audit.seo`.
 */
export interface SeoAudit {
  title: string | null;
  metaDescriptionLength: number;
  h1Count: number;
  /** `<html lang="sv">` -- tells search engines which language the page is in. */
  lang: string | null;
  canonical: boolean;
  /** og:title and og:image -- what a shared link looks like on Facebook or LinkedIn. */
  openGraph: boolean;
  /** schema.org types from JSON-LD and microdata, e.g. ["HairSalon", "WebSite"]. */
  schemaTypes: string[];
  noindex: boolean;
  images: number;
  imagesWithoutAlt: number;
  /** Words of visible text. A home page of a hundred words gives a search engine little to go on. */
  wordCount: number;
  /** A `tel:` link: a phone visitor can call with one tap. */
  telLink: boolean;
}

/**
 * Types that say what the PAGE is, not what the BUSINESS is. A site with only
 * these has structured data, but nothing telling Google it is a local company
 * with an address and opening hours -- which is the markup that matters for
 * a small business.
 *
 * `Organization` is here too: Yoast and Rank Math put one on every WordPress
 * site by default, and it carries no address, area or opening hours. The parts
 * a LocalBusiness is built from (address, rating, offer) say nothing alone.
 */
const GENERIC_TYPES = new Set([
  "Organization",
  "Corporation",
  "PostalAddress",
  "GeoCoordinates",
  "ContactPoint",
  "OpeningHoursSpecification",
  "AggregateRating",
  "Rating",
  "Review",
  "Offer",
  "WebSite",
  "WebPage",
  "CollectionPage",
  "AboutPage",
  "ContactPage",
  "ItemPage",
  "SiteNavigationElement",
  "WPHeader",
  "WPFooter",
  "WPSideBar",
  "BreadcrumbList",
  "ListItem",
  "ItemList",
  "ImageObject",
  "VideoObject",
  "SearchAction",
  "ReadAction",
  "EntryPoint",
  "Person",
  "Article",
  "BlogPosting",
  "Thing",
  "PropertyValueSpecification",
]);

function collectTypes(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => collectTypes(child, into));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  for (const value of Array.isArray(type) ? type : [type]) {
    if (typeof value === "string") into.add(value.replace(/^https?:\/\/schema\.org\//, ""));
  }
  for (const [key, value] of Object.entries(record)) {
    if (key !== "@type" && typeof value === "object") collectTypes(value, into);
  }
}

/** schema.org types, from JSON-LD blocks and microdata `itemtype`s. */
export function findSchemaTypes(html: string): string[] {
  const types = new Set<string>();
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectTypes(JSON.parse(block[1].trim()), types);
    } catch {
      // A broken JSON-LD block is markup Google ignores too.
    }
  }
  for (const match of html.matchAll(/itemtype=["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi)) {
    types.add(match[1]);
  }
  return [...types].sort();
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function metaContent(html: string, key: "name" | "property", value: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (attr(tag, key)?.toLowerCase() === value) return attr(tag, "content");
  }
  return null;
}

export function auditSeo(html: string, text: string): SeoAudit {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  const robots = metaContent(html, "name", "robots") ?? "";

  return {
    title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() || null : null,
    metaDescriptionLength: decodeEntities(metaContent(html, "name", "description") ?? "").trim().length,
    h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
    lang: attr(htmlTag, "lang") || null,
    canonical: /<link\b[^>]*rel=["']canonical["']/i.test(html),
    openGraph: Boolean(metaContent(html, "property", "og:title") && metaContent(html, "property", "og:image")),
    schemaTypes: findSchemaTypes(html),
    noindex: /noindex/i.test(robots),
    images: images.length,
    imagesWithoutAlt: images.filter((tag) => !attr(tag, "alt")?.trim()).length,
    wordCount: text ? text.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length : 0,
    telLink: /href\s*=\s*["']tel:/i.test(html),
  };
}

export interface SeoImprovement {
  /** Kort, som en rad i en checklista. */
  label: string;
  /** Varför det spelar roll, i en mening en säljare kan säga högt. */
  detail: string;
  priority: "high" | "medium" | "low";
}

const GENERIC_TITLE = /^(hem|home|start|startsida|välkommen|welcome|index|untitled|ny sida)$/i;

/**
 * Vad som borde göras, viktigast först. Varje punkt är något en ny eller
 * uppdaterad sajt löser -- inte ett betyg.
 */
export function seoImprovements(seo: SeoAudit): SeoImprovement[] {
  const list: SeoImprovement[] = [];

  if (seo.noindex) {
    list.push({
      label: "Startsidan är dold för Google",
      detail: "Sidan ber sökmotorer att inte indexera den (noindex), så den kan inte synas i sökresultaten alls.",
      priority: "high",
    });
  }
  if (!seo.title || GENERIC_TITLE.test(seo.title)) {
    list.push({
      label: seo.title ? `Sidtiteln är bara "${seo.title}"` : "Ingen sidtitel",
      detail: "Titeln är den blå rubriken i Googles resultat och bör säga vad företaget gör och var.",
      priority: "high",
    });
  } else if (seo.title.length > 65) {
    list.push({
      label: "För lång sidtitel",
      detail: `Titeln är ${seo.title.length} tecken; Google kapar efter ungefär 60.`,
      priority: "low",
    });
  }
  if (!seo.schemaTypes.some((type) => !GENERIC_TYPES.has(type))) {
    list.push({
      label: seo.schemaTypes.length === 0 ? "Ingen strukturerad data" : "Ingen företagsmärkning (LocalBusiness)",
      detail:
        "Utan schema.org-märkning vet Google inte i koden vilken sorts företag det är, var det ligger eller när det har öppet.",
      priority: "high",
    });
  }
  if (seo.metaDescriptionLength === 0) {
    list.push({
      label: "Ingen metabeskrivning",
      detail: "Google väljer då själv en textbit under rubriken i sökresultatet, ofta en meny eller en cookietext.",
      priority: "medium",
    });
  } else if (seo.metaDescriptionLength < 50 || seo.metaDescriptionLength > 170) {
    list.push({
      label: seo.metaDescriptionLength < 50 ? "Kort metabeskrivning" : "Lång metabeskrivning",
      detail: `Beskrivningen är ${seo.metaDescriptionLength} tecken; runt 120–160 ger en hel mening i sökresultatet.`,
      priority: "low",
    });
  }
  if (seo.h1Count === 0) {
    list.push({
      label: "Ingen huvudrubrik (H1)",
      detail: "Sidan saknar en H1, den rubrik sökmotorer läser som sidans ämne.",
      priority: "medium",
    });
  } else if (seo.h1Count > 1) {
    list.push({
      label: `${seo.h1Count} huvudrubriker (H1)`,
      detail: "Flera H1:or gör det otydligt för sökmotorer vad sidan främst handlar om.",
      priority: "low",
    });
  }
  if (seo.wordCount < 150) {
    list.push({
      label: "Lite text på startsidan",
      detail: `Bara omkring ${seo.wordCount} ord. Sökmotorer behöver text för att förstå vad företaget erbjuder.`,
      priority: "medium",
    });
  }
  if (seo.images >= 3 && seo.imagesWithoutAlt / seo.images > 0.3) {
    list.push({
      label: `${seo.imagesWithoutAlt} av ${seo.images} bilder saknar alt-text`,
      detail: "Alt-texten är det sökmotorer och skärmläsare läser i stället för bilden.",
      priority: "low",
    });
  }
  if (!seo.telLink) {
    list.push({
      label: "Inget klickbart telefonnummer",
      detail: "Den som besöker sajten i mobilen kan inte ringa med ett tryck.",
      priority: "medium",
    });
  }
  if (!seo.openGraph) {
    list.push({
      label: "Ingen förhandsvisning vid delning",
      detail: "Saknar Open Graph-taggar, så en delad länk på Facebook eller LinkedIn visas utan bild och rubrik.",
      priority: "low",
    });
  }
  if (!seo.lang) {
    list.push({
      label: "Inget språk angivet",
      detail: "Sidan säger inte att den är på svenska (lang-attributet), vilket hjälper sökmotorer och skärmläsare.",
      priority: "low",
    });
  }
  if (!seo.canonical) {
    list.push({
      label: "Ingen kanonisk adress",
      detail: "Utan canonical kan samma sida räknas flera gånger, med och utan www eller https.",
      priority: "low",
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return list.sort((a, b) => order[a.priority] - order[b.priority]);
}
