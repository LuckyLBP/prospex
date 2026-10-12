import { decodeEntities } from "@/lib/enrich/extract";
import { withinBoundary } from "./safe-url";

// Kända plattformar som en webbplats länkar till: bokning, kataloger, tjänsteplattformar och omdömen. Det visar
// var företaget finns utanför sin egen sajt, utan någon webbsökning. Ren och testad.

export type PlatformKind = "Bokning" | "Katalog" | "Tjänsteplattform" | "Omdömen";
export interface KnownPlatform {
  domain: string;
  name: string;
  kind: PlatformKind;
}

export const KNOWN_PLATFORMS: KnownPlatform[] = [
  { domain: "bokadirekt.se", name: "Bokadirekt", kind: "Bokning" },
  { domain: "timma.se", name: "Timma", kind: "Bokning" },
  { domain: "bokamera.com", name: "BokaMera", kind: "Bokning" },
  { domain: "boka.se", name: "Boka.se", kind: "Bokning" },
  { domain: "eniro.se", name: "Eniro", kind: "Katalog" },
  { domain: "hitta.se", name: "Hitta.se", kind: "Katalog" },
  { domain: "allabolag.se", name: "Allabolag", kind: "Katalog" },
  { domain: "ratsit.se", name: "Ratsit", kind: "Katalog" },
  { domain: "merinfo.se", name: "Merinfo", kind: "Katalog" },
  { domain: "brabyggare.se", name: "BraByggare", kind: "Tjänsteplattform" },
  { domain: "servicefinder.se", name: "Servicefinder", kind: "Tjänsteplattform" },
  { domain: "dorunner.se", name: "Dorunner", kind: "Tjänsteplattform" },
  { domain: "mittanbud.se", name: "Mittanbud", kind: "Tjänsteplattform" },
  { domain: "offerta.se", name: "Offerta", kind: "Tjänsteplattform" },
  { domain: "trustpilot.com", name: "Trustpilot", kind: "Omdömen" },
  { domain: "reco.se", name: "Reco", kind: "Omdömen" },
  { domain: "tripadvisor.se", name: "Tripadvisor", kind: "Omdömen" },
];

export interface PlatformLink extends KnownPlatform {
  url: string;
}

/** En länk per plattform, i den ordning de förekommer, utan sajtens egna länkar. */
export function knownPlatformLinks(html: string, siteDomain: string): PlatformLink[] {
  const found = new Map<string, PlatformLink>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    let url: URL;
    try {
      const href = decodeEntities(m[1]).trim();
      url = new URL(href.startsWith("//") ? `https:${href}` : href);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (withinBoundary(host, siteDomain)) continue;
    const platform = KNOWN_PLATFORMS.find((p) => host === p.domain || host.endsWith(`.${p.domain}`));
    if (platform && !found.has(platform.domain)) found.set(platform.domain, { ...platform, url: url.toString() });
  }
  return [...found.values()];
}

/**
 * Plattformar som webbplatsen KÖRS på: sajtbyggare, publiceringssystem och webbhotell. En "Powered by"-länk till en av
 * dem är tekniken bakom sajten, inte byrån som byggt den, och en byrå ska aldrig bli en av dem. Listan växer med
 * fallen vi ser, och en admin kan lägga till fler i efterhand (credit_kinds).
 */
export const WEB_PLATFORMS: { domain: string; name: string }[] = [
  { domain: "snowfire.se", name: "Snowfire" },
  { domain: "wix.com", name: "Wix" },
  { domain: "wixsite.com", name: "Wix" },
  { domain: "squarespace.com", name: "Squarespace" },
  { domain: "shopify.com", name: "Shopify" },
  { domain: "webflow.com", name: "Webflow" },
  { domain: "jimdo.com", name: "Jimdo" },
  { domain: "jimdofree.com", name: "Jimdo" },
  { domain: "webnode.se", name: "Webnode" },
  { domain: "webnode.com", name: "Webnode" },
  { domain: "weebly.com", name: "Weebly" },
  { domain: "wordpress.com", name: "WordPress.com" },
  { domain: "wordpress.org", name: "WordPress" },
  { domain: "one.com", name: "one.com" },
  { domain: "godaddy.com", name: "GoDaddy" },
  { domain: "sitevision.se", name: "Sitevision" },
  { domain: "episerver.com", name: "Optimizely" },
  { domain: "optimizely.com", name: "Optimizely" },
  { domain: "umbraco.com", name: "Umbraco" },
  { domain: "drupal.org", name: "Drupal" },
  { domain: "joomla.org", name: "Joomla" },
  { domain: "ghost.org", name: "Ghost" },
  { domain: "hubspot.com", name: "HubSpot" },
  { domain: "loopia.se", name: "Loopia" },
  { domain: "binero.se", name: "Binero" },
];

/** Är domänen en känd plattform eller ett webbhotell (eller en underdomän till en)? Ren. */
export function isWebPlatformDomain(domain: string | null | undefined, extra: ReadonlySet<string> = new Set()): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase().replace(/^www\./, "");
  return extra.has(d) || WEB_PLATFORMS.some((p) => d === p.domain || d.endsWith(`.${p.domain}`));
}
