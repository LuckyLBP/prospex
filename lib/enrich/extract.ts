import { normalizeSwedishPhone } from "./phone";
import { findOrgNumber } from "./orgnr";

/**
 * Pulling a company out of its own home page.
 *
 * PublicWWW and ViewDNS answer with domains. Everything the dashboard actually
 * shows -- name, phone, email, org number -- has to come from the site itself,
 * so this file is the difference between a list of domains and a list of
 * leads. It is pure: HTML in, fields out, no network, which is what makes it
 * testable against real page shapes.
 */

export interface ExtractedContacts {
  companyName: string | null;
  email: string | null;
  phone: string | null;
  orgnr: string | null;
  /** Everything found, kept in raw.enrichment so a wrong pick can be audited. */
  emails: string[];
  phones: string[];
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAILTO = /href\s*=\s*["']mailto:([^"'?]+)/gi;
const TEL = /href\s*=\s*["']tel:([^"']+)/gi;
const PHONE_TEXT = /(?:\+46|0046|0)\s?[1-9](?:[\s\- ]?\d){6,9}/g;

// Addresses that belong to the tooling rather than the company.
const EMAIL_NOISE =
  /(\.(png|jpe?g|gif|svg|webp|css|js)$|sentry|wixpress|example\.(com|org)|@sentry|godaddy|squarespace|\.local$)/i;
const ROLE_PREFIX = /^(info|kontakt|hej|hello|mail|order|bokning|boka)@/i;

const GENERIC_TITLE = /^(hem|start|startsida|home|välkommen|welcome|index)$/i;

/** Tags whose text would otherwise pollute the visible-text scan. */
function stripNonContent(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  aring: "å",
  auml: "ä",
  ouml: "ö",
  Aring: "Å",
  Auml: "Ä",
  Ouml: "Ö",
};

/**
 * Entities, decoded.
 *
 * Everything this file returns is read by a person in the record list, and
 * "Betong &amp; Prefab" is not a company name anyone would type. It has to
 * happen in BOTH places a name can come from -- the visible text and a meta
 * tag's content -- because a meta tag's value is escaped exactly like text is.
 */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name] ?? whole);
}

/** Visible text, roughly: tags removed, entities decoded. */
export function toText(html: string): string {
  return decodeEntities(stripNonContent(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A page that is not the page: an anti-bot interstitial.
 *
 * Some hosts (SiteGround's sgcaptcha, among others) answer a plain GET with a
 * few hundred bytes of meta-refresh pointing at a challenge, and do it with a
 * 2xx status. Read as a web page it is a site with a name of nothing and no
 * contact details -- which is exactly what a real but empty site looks like.
 * Telling them apart matters: one is a lead with no phone number on its home
 * page, the other is a page we never actually saw.
 *
 * The tell is structural, not the host's name: no title, no body text to speak
 * of, and a redirect the browser is expected to follow.
 */
export function isInterstitial(html: string): boolean {
  if (html.length > 4000) return false;
  if (/<title[^>]*>\s*\S/i.test(html)) return false;
  const refresh = /<meta[^>]+http-equiv\s*=\s*["']refresh["'][^>]*>/i.test(html);
  return refresh && toText(html).length < 200;
}

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`,
    "i",
  );
  const tag = pattern.exec(html)?.[0];
  if (!tag) return null;
  const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  return content ? decodeEntities(content).trim() || null : null;
}

/**
 * The company's name.
 *
 * og:site_name is the site saying what it is called, so it wins. A <title> is
 * a page title -- "Boka tid | Salong Ada | Stockholm" -- and is split on its
 * separators. The first segment is normally the name, except when it is a
 * generic page word, in which case the name is elsewhere in the string.
 */
export function extractCompanyName(html: string): string | null {
  const siteName = metaContent(html, "og:site_name");
  if (siteName) return clampName(siteName);

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (!title) return null;

  const segments = toText(title)
    .split(/\s*[|–—·]\s*|\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length === 0) return null;
  const named = segments.find((segment) => !GENERIC_TITLE.test(segment));
  return clampName(named ?? segments[0]);
}

function clampName(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, 120);
  return trimmed === "" ? null : trimmed;
}

/**
 * Emails, best first.
 *
 * A mailto: link is the site pointing at its own inbox and outranks an address
 * that merely appears in the text. After that, an address on the site's own
 * domain beats a Gmail one, and a role address (info@, kontakt@) beats a named
 * employee -- this is a prospecting list, not a contact book.
 */
export function extractEmails(html: string, siteDomain?: string | null): string[] {
  const ranked: { value: string; score: number }[] = [];
  const seen = new Set<string>();

  function add(raw: string, fromLink: boolean) {
    const value = raw.trim().toLowerCase().replace(/[.,;:]+$/, "");
    if (!value || seen.has(value) || EMAIL_NOISE.test(value)) return;
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value)) return;
    seen.add(value);

    let score = fromLink ? 4 : 0;
    if (siteDomain && value.endsWith(`@${siteDomain}`)) score += 3;
    if (siteDomain && value.endsWith(`.${siteDomain}`)) score += 2;
    if (ROLE_PREFIX.test(value)) score += 2;
    ranked.push({ value, score });
  }

  MAILTO.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MAILTO.exec(html)) !== null) add(decodeURIComponent(match[1]), true);

  const text = stripNonContent(html);
  EMAIL.lastIndex = 0;
  while ((match = EMAIL.exec(text)) !== null) add(match[0], false);

  return ranked.sort((a, b) => b.score - a.score).map((entry) => entry.value);
}

/** Phone numbers, tel: links first, all normalised to +46 form. */
export function extractPhones(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  function add(raw: string) {
    const value = normalizeSwedishPhone(raw);
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  }

  TEL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEL.exec(html)) !== null) add(match[1]);

  const text = toText(html);
  PHONE_TEXT.lastIndex = 0;
  while ((match = PHONE_TEXT.exec(text)) !== null) add(match[0]);

  return out;
}

export function extractContacts(html: string, siteDomain?: string | null): ExtractedContacts {
  const emails = extractEmails(html, siteDomain);
  const phones = extractPhones(html);
  const text = toText(html);

  return {
    companyName: extractCompanyName(html),
    email: emails[0] ?? null,
    phone: phones[0] ?? null,
    orgnr: findOrgNumber(text),
    emails,
    phones,
  };
}
