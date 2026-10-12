import { toText } from "./extract";
import { auditSeo, type SeoAudit } from "./seo";

/**
 * What a home page says about how old the site is.
 *
 * Read from the page the enrichment already fetched -- no extra request -- and
 * pure, like extract.ts: HTML in, facts out. A seller does not need a Lighthouse
 * score; they need a sentence they can say on the phone. So every fact here is
 * one a person would recognise: no HTTPS, not built for a phone, "© 2017" in
 * the footer, "Hemsida skapad av X".
 *
 * Stored in `scrape_records.site_audit`. `version` is there so a later change
 * to the shape can tell old rows from new ones, the same way RegistryData does.
 */
export interface SiteAudit {
  version: 1;
  https: boolean;
  /** A viewport meta tag. Without one a phone renders the desktop page shrunk. */
  mobile: boolean;
  cms: string | null;
  /** "6.4.2" from `<meta name="generator" content="WordPress 6.4.2">`. */
  cmsVersion: string | null;
  /** Page builder on top of the CMS: Elementor, Divi, WPBakery … */
  builder: string | null;
  /** The WordPress theme folder, which often names the agency. */
  theme: string | null;
  /** The latest year in the footer's copyright line. */
  copyrightYear: number | null;
  /** "Hemsida skapad av X" -- who the site says built it. */
  credit: string | null;
  analytics: boolean;
  tagManager: boolean;
  metaPixel: boolean;
  /** A booking system linked or embedded on the page. */
  booking: string | null;
  metaDescription: boolean;
  /** On-page SEO (seo.ts). Missing on rows audited before it existed. */
  seo?: SeoAudit;
}

interface Signature {
  name: string;
  pattern: RegExp;
}

// Order matters: the first match wins, and a site on Mono or Wix can still
// load a script from somewhere that looks like WordPress.
const CMS: Signature[] = [
  { name: "Wix", pattern: /static\.wixstatic\.com|wix-code|<meta[^>]+content=["']Wix\.com/i },
  { name: "Squarespace", pattern: /static1\.squarespace\.com|squarespace-cdn/i },
  { name: "Webflow", pattern: /data-wf-page|assets\.website-files\.com|webflow\.js/i },
  { name: "Shopify", pattern: /cdn\.shopify\.com/i },
  { name: "Mono (Eniro)", pattern: /mono\.net\/|monosolutions|mono-site/i },
  { name: "SiteVision", pattern: /sitevision/i },
  { name: "Jimdo", pattern: /jimdo(?:cdn|free|site)?\.com/i },
  { name: "Weebly", pattern: /weebly\.com/i },
  { name: "Joomla", pattern: /\/media\/jui\/|<meta[^>]+content=["']Joomla/i },
  { name: "Drupal", pattern: /\/sites\/default\/files\/|Drupal\.settings|<meta[^>]+content=["']Drupal/i },
  { name: "WordPress", pattern: /\/wp-content\/|\/wp-includes\//i },
];

const BUILDERS: Signature[] = [
  { name: "Elementor", pattern: /\/plugins\/elementor\/|elementor-element/i },
  { name: "Divi", pattern: /\/themes\/Divi\/|et_pb_section/i },
  { name: "WPBakery", pattern: /js_composer|vc_row|wpb_wrapper/i },
  { name: "Avada", pattern: /\/themes\/Avada\/|fusion-builder/i },
  { name: "Beaver Builder", pattern: /\/plugins\/bb-plugin\/|fl-builder-content/i },
  { name: "Oxygen", pattern: /\/plugins\/oxygen\/|ct-section/i },
  { name: "Bricks", pattern: /\/themes\/bricks\/|brxe-/i },
];

const BOOKING: Signature[] = [
  { name: "Bokadirekt", pattern: /bokadirekt\.se/i },
  { name: "Timma", pattern: /timma\.(?:se|no|fi)/i },
  { name: "BokaMera", pattern: /bokamera\.se/i },
  { name: "Cliento", pattern: /cliento\.com/i },
  { name: "EasyPractice", pattern: /easypractice\.net/i },
  { name: "SimplyBook", pattern: /simplybook\.(?:me|it)/i },
  { name: "Calendly", pattern: /calendly\.com/i },
  { name: "Planway", pattern: /planway\.(?:se|com)/i },
];

function firstMatch(html: string, signatures: Signature[]): string | null {
  return signatures.find((s) => s.pattern.test(html))?.name ?? null;
}

function metaContent(html: string, name: string): string | null {
  // Attribute order varies between themes, so both orders are tried.
  const nameFirst = new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i");
  return (html.match(nameFirst) ?? html.match(contentFirst))?.[1]?.trim() || null;
}

/**
 * The latest year in a copyright line. "© 2015–2019 Firma AB" is 2019, which is
 * the year someone last touched it. A theme that prints the current year with
 * code says nothing either way -- but an OLD year is a fact, and that is the
 * one worth having.
 */
export function findCopyrightYear(text: string, now: Date = new Date()): number | null {
  const thisYear = now.getFullYear();
  let latest: number | null = null;
  for (const match of text.matchAll(/(?:©|\(c\)|copyright)([^©]{0,40})/gi)) {
    for (const year of match[1].matchAll(/\b(19[89]\d|20\d\d)\b/g)) {
      const value = Number(year[1]);
      if (value <= thisYear && (latest === null || value > latest)) latest = value;
    }
  }
  return latest;
}

// The phrase is matched without regard to case, the NAME after it with: a name
// is the run of capitalised words, so "skapad av Conseo alla rättigheter
// förbehållna" stops at "Conseo".
const CREDIT_PHRASE =
  /(?:(?:skapad|gjord|utvecklad|producerad|byggd|designad|levererad)\s+(?:med\s+\S+\s+)?av|powered\s+by|webbdesign\s+av|design\s+av|webbyrå:)\s+/i;
// A dot inside a word is part of it ("infid.dev"); one at the end closes the name.
const CREDIT_WORD = String.raw`[A-ZÅÄÖ0-9](?:[\wåäöÅÄÖ&\-]|\.(?=\w))*`;
const CREDIT_NAME = new RegExp(`^(${CREDIT_WORD}(?:\\s+${CREDIT_WORD}){0,3})`);

// Credits that name the tool, not the agency: "Powered by WordPress" tells a
// seller nothing the CMS field does not already say.
const TOOL_CREDIT = /^(wordpress|wix|squarespace|shopify|webflow|joomla|drupal|elementor|jimdo|weebly|one\.com)\b/i;

/** "Hemsida skapad av Conseo" → "Conseo". */
export function findCredit(text: string): string | null {
  const phrase = CREDIT_PHRASE.exec(text);
  if (!phrase) return null;
  const match = text.slice(phrase.index + phrase[0].length).match(CREDIT_NAME);
  if (!match) return null;
  const credit = match[1].replace(/[.\-&]+$/, "").trim();
  if (!credit || TOOL_CREDIT.test(credit)) return null;
  return credit;
}

export function auditSite(html: string, finalUrl: string, now: Date = new Date()): SiteAudit {
  const text = toText(html);
  const generator = metaContent(html, "generator");
  const cms = firstMatch(html, CMS);
  const versionMatch = generator?.match(/^(?:WordPress|Joomla!?|Drupal)\s+([\d.]+)/i);

  return {
    version: 1,
    https: finalUrl.toLowerCase().startsWith("https:"),
    mobile: /<meta[^>]+name=["']viewport["']/i.test(html),
    cms,
    cmsVersion: versionMatch?.[1] ?? null,
    builder: cms === "WordPress" ? firstMatch(html, BUILDERS) : null,
    theme: html.match(/\/wp-content\/themes\/([a-z0-9_-]+)\//i)?.[1] ?? null,
    copyrightYear: findCopyrightYear(text, now),
    credit: findCredit(text),
    analytics: /googletagmanager\.com\/gtag\/js|google-analytics\.com\/(?:analytics|ga)\.js|gtag\(\s*['"]config/i.test(html),
    tagManager: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/.test(html),
    metaPixel: /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init/i.test(html),
    booking: firstMatch(html, BOOKING),
    metaDescription: (metaContent(html, "description")?.length ?? 0) >= 10,
    seo: auditSeo(html, text),
  };
}

/** Kolumnens innehåll, om det är i den form appen skrev. */
export function readSiteAudit(value: unknown): SiteAudit | null {
  const data = value as Partial<SiteAudit> | null;
  return data && data.version === 1 && typeof data.https === "boolean" ? (data as SiteAudit) : null;
}

export interface SiteIssue {
  /** Vad säljaren läser, kort. */
  label: string;
  /** true = ett skäl att ringa. false = värt att veta men inget fel. */
  outdated: boolean;
}

/** WordPress older than this major version is years behind on security updates. */
const OLD_WORDPRESS_MAJOR = 6;
/** A copyright year this many years back reads as "nobody has touched it". */
const STALE_YEARS = 3;

/**
 * Vad kollen betyder, i den ordning en säljare vill höra det: först det som
 * gör sajten gammal, sedan det som saknas.
 */
export function siteIssues(audit: SiteAudit, now: Date = new Date()): SiteIssue[] {
  const issues: SiteIssue[] = [];
  if (!audit.https) issues.push({ label: "Ingen HTTPS", outdated: true });
  if (!audit.mobile) issues.push({ label: "Inte mobilanpassad", outdated: true });
  if (audit.copyrightYear !== null && audit.copyrightYear <= now.getFullYear() - STALE_YEARS) {
    issues.push({ label: `© ${audit.copyrightYear} i sidfoten`, outdated: true });
  }
  if (audit.cms === "WordPress" && audit.cmsVersion) {
    const major = Number(audit.cmsVersion.split(".")[0]);
    if (major < OLD_WORDPRESS_MAJOR) issues.push({ label: `WordPress ${audit.cmsVersion}`, outdated: true });
  }
  if (!audit.analytics && !audit.tagManager) issues.push({ label: "Ingen Google Analytics", outdated: false });
  // With the SEO check present the description is one of its points instead.
  if (!audit.seo && !audit.metaDescription) issues.push({ label: "Ingen metabeskrivning", outdated: false });
  return issues;
}

/** Slutsatsen som sparas i `site_outdated` och som ringlägets filter läser. */
export function isOutdated(audit: SiteAudit, now: Date = new Date()): boolean {
  return siteIssues(audit, now).some((issue) => issue.outdated);
}
