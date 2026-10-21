import { normalizeDomain } from "@/lib/scrapers/domain";
import { agencyKey, footerText } from "@/lib/profile/creator";
import { findTraces, type Trace } from "./traces";

// Är det här byrån? Rena regler som verifieringen och katalogsökningen delar. Ett namn räcker aldrig ensamt när det är
// för kort eller för vanligt: "Webb" eller "Media" ska inte matcha en annan byrå.

export interface Agency {
  name: string;
  /** Byråns egen domän, normaliserad. */
  domain: string;
}

/** Samma domän eller en underdomän till den. */
export function isSameOrSubdomain(candidate: string | null | undefined, domain: string): boolean {
  const d = normalizeDomain(candidate);
  return !!d && (d === domain || d.endsWith(`.${domain}`));
}

/** Namn som är en vanlig branschterm och därför inte kan identifiera en byrå utan länk. */
const VAGUE = new Set(["webb", "web", "media", "reklam", "design", "digital", "byrå", "studio", "kommunikation", "marknad", "marknadsföring", "bureau", "agency"]);

/** Pekar kreditraden ut den här byrån, på domän eller på kärnnamn? */
export function creatorMatchesAgency(creator: { name: string; domain: string | null } | null | undefined, agency: Agency): boolean {
  if (!creator) return false;
  if (creator.domain && isSameOrSubdomain(creator.domain, agency.domain)) return true;
  const a = agencyKey(creator.name);
  const b = agencyKey(agency.name);
  // Ett kärnnamn på en enda kort bokstavsföljd är för vagt för att räcka utan länk.
  return a.length >= 4 && a === b && !VAGUE.has(a);
}

const FOOTER_WINDOW = 12_000;

/** Nämner sidan domänen, som länk eller som text? Används för att styrka att byråns egen sida listar en kund. */
export function pageMentionsDomain(html: string, domain: string): boolean {
  for (const m of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (/^(?:https?:)?\/\//i.test(href) && isSameOrSubdomain(href.startsWith("//") ? `https:${href}` : href, domain)) return true;
  }
  const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
  return new RegExp(`(?:^|[^a-z0-9-])(?:www\\.)?${domain.replace(/\./g, "\\.")}(?![a-z0-9-])`).test(text);
}

/** Länkar sidfoten (sist i dokumentet om det saknas en) till byråns domän? */
export function footerLinksTo(html: string, agencyDomain: string): boolean {
  const footerAt = html.toLowerCase().lastIndexOf("<footer");
  const region = footerAt >= 0 ? html.slice(footerAt) : html.slice(Math.max(0, html.length - FOOTER_WINDOW));
  for (const m of region.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (!/^(?:https?:)?\/\//i.test(href)) continue;
    if (isSameOrSubdomain(href.startsWith("//") ? `https:${href}` : href, agencyDomain)) return true;
  }
  return false;
}

/**
 * Länkar sidan till en e-postadress hos byrån (mailto:offert@byran.se), eller anger den som sidans egen e-postadress i
 * strukturerad data ("email": "info@byran.se")? Då styr byrån sidans förfrågningar, vilket en kund sällan har.
 */
export function contactsAgency(html: string, agencyDomain: string): string | null {
  const own = (address: string) => {
    const host = address.split("@")[1];
    return !!host && isSameOrSubdomain(host, agencyDomain);
  };
  for (const m of html.matchAll(/\bhref\s*=\s*["']mailto:([^"'?]+)/gi)) {
    let address = m[1];
    try {
      address = decodeURIComponent(address);
    } catch {
      /* en trasig procentkodning: använd texten som den är */
    }
    address = address.trim().toLowerCase();
    if (own(address)) return address;
  }
  // JSON-LD och andra datablock: bara fältet "email", så att en adress som nämns i löptext inte räknas.
  for (const m of html.matchAll(/["']email["']\s*:\s*["']([^"'\s]+@[^"'\s]+)["']/gi)) {
    const address = m[1].trim().toLowerCase();
    if (own(address)) return address;
  }
  return null;
}

/** Byråns varumärkesord: första ordet i namnet och domänens första led, utan vaga branschord. "Capace Media Group" och capace.se ger "capace". */
export function agencyBrands(agency: Agency): string[] {
  const first = agencyKey(agency.name).split(" ")[0] ?? "";
  const label = agency.domain.split(".")[0] ?? "";
  return [...new Set([first, label].filter((b) => b.length >= 4 && !VAGUE.has(b)))];
}

const wordRe = (brand: string) => new RegExp(`(?:^|[^a-zåäö0-9])${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-zåäö0-9])`, "gi");
const CREDIT_CUE = /(?:byggd|skapad|gjord|utvecklad|designad|producerad|levererad|drivs|driven|hemsida|webbplats|webbyrå|webbdesign|e-handel|powered|made|built|created|design|\bav\b|\bby\b|♥|❤)/i;

/**
 * En kredit som bara är text: "Byggd med ♥ av Capace Media" utan länk. Byråns namn i sidfoten, med ett kreditord strax före.
 * Returnerar raden som belägg, eller null.
 */
export function footerTextCredit(html: string, agency: Agency): string | null {
  const text = footerText(html, 4000);
  for (const brand of agencyBrands(agency)) {
    for (const m of text.matchAll(wordRe(brand))) {
      const at = (m.index ?? 0) + (m[0].length - brand.length);
      if (CREDIT_CUE.test(text.slice(Math.max(0, at - 50), at))) return text.slice(Math.max(0, at - 40), at + brand.length + 20).trim();
    }
  }
  return null;
}

/**
 * Byråns fingeravtryck i sajtens kod, för kunder som inte visar något synligt: en generator-tagg, ett tema eller tillägg som
 * bär namnet, en variabel i sidans skript (window.byran_design_data), datafält, filer eller anrop till byråns egna adresser,
 * en kommentar. Se traces.ts. Returnerar det första spåret som belägg, eller null.
 */
export function agencyTrace(html: string, agency: Agency): Trace | null {
  return findTraces(html, agency, agencyBrands(agency))[0] ?? null;
}

export function agencyFingerprint(html: string, agency: Agency): string | null {
  return agencyTrace(html, agency)?.evidence ?? null;
}

/** Vad länktexten i ett bakåtlänkssvar säger: en kreditrad som nämner byrån, bara byråns namn, eller inget om den. */
export function anchorNamesAgency(anchor: string | null | undefined, agency: Agency): "credit" | "name" | null {
  if (!anchor) return null;
  const a = anchor.toLowerCase();
  if (!agencyBrands(agency).some((b) => wordRe(b).test(a))) return null;
  return CREDIT_CUE.test(a) || /webbyrå|hemsida/.test(a) ? "credit" : "name";
}
