import { normalizeDomain, websiteUrl } from "../domain";
import type { CollectedItem } from "../types";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";
import { isValidOrgNumber, normalizeOrgNumber } from "@/lib/enrich/orgnr";
import { decodeEntities } from "@/lib/enrich/extract";
import { shouldSkipEnrichment } from "./prefill";

// Parsing for the BraByggare script, kept apart from the handler so it can be
// tested without the network or "server-only".
//
// Every contractor profile (/hantverkare/<id>/) carries a schema.org
// ProfilePage whose mainEntity is the company: name, website, phone, email,
// org number and address. That block is what the site publishes for search
// engines, so it is both the most stable thing on the page and the whole of
// what this script needs.

const PROFILE_PATH = /^https?:\/\/(?:www\.)?brabyggare\.se\/hantverkare\/(\d+)\/?$/i;

/**
 * Hosts a contractor sometimes enters as "website" that are not theirs.
 * Using one as the domain would merge every such company into one record.
 */
const FOREIGN_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "google.com",
  "business.site",
  "brabyggare.se",
  "hitta.se",
  "eniro.se",
  "allabolag.se",
];

/** The sitemap's contractor profile URLs, in sitemap order, without duplicates. */
export function parseProfileUrls(sitemapXml: string): string[] {
  const seen = new Set<string>();
  for (const match of sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const url = decodeEntities(match[1]);
    if (PROFILE_PATH.test(url)) seen.add(url);
  }
  return [...seen];
}

export function profileId(url: string): string | null {
  return PROFILE_PATH.exec(url)?.[1] ?? null;
}

interface LdEntity {
  name?: unknown;
  url?: unknown;
  telephone?: unknown;
  email?: unknown;
  identifier?: unknown;
  address?: { streetAddress?: unknown; postalCode?: unknown; addressLocality?: unknown };
  aggregateRating?: { ratingValue?: unknown; ratingCount?: unknown };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findProfileEntity(html: string): LdEntity | null {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1]) as { "@type"?: unknown; mainEntity?: unknown };
      if (data["@type"] === "ProfilePage" && data.mainEntity && typeof data.mainEntity === "object") {
        return data.mainEntity as LdEntity;
      }
    } catch {
      // Another block, or a malformed one: keep looking.
    }
  }
  return null;
}

function companyDomain(url: string | null): string | null {
  const domain = normalizeDomain(url);
  if (!domain) return null;
  const foreign = FOREIGN_HOSTS.some((host) => domain === host || domain.endsWith(`.${host}`));
  return foreign ? null : domain;
}

function readOrgnr(identifier: unknown): string | null {
  const list = Array.isArray(identifier) ? identifier : [identifier];
  for (const entry of list) {
    const value = str((entry as { value?: unknown } | null)?.value);
    // Sole traders show a masked personal number ("670303-XXXX"), which is
    // not an org number and fails here.
    if (value && isValidOrgNumber(value)) return normalizeOrgNumber(value);
  }
  return null;
}

/** One profile page -> one item, or null when the page has no company block. */
export function parseProfilePage(html: string, sourceUrl: string): CollectedItem | null {
  const entity = findProfileEntity(html);
  const id = profileId(sourceUrl);
  if (!entity || !id) return null;

  const statedWebsite = str(entity.url);
  const domain = companyDomain(statedWebsite);
  const phone = normalizeSwedishPhone(str(entity.telephone));
  const email = str(entity.email)?.toLowerCase() ?? null;

  return {
    dedupeKey: domain ?? `brabyggare:${id}`,
    domain,
    website: domain ? websiteUrl(domain) : null,
    sourceUrl,
    companyName: str(entity.name),
    phone,
    email,
    orgnr: readOrgnr(entity.identifier),
    raw: {
      brabyggare_id: id,
      stated_website: statedWebsite,
      street: str(entity.address?.streetAddress),
      postal_code: str(entity.address?.postalCode),
      city: str(entity.address?.addressLocality),
      rating: str(entity.aggregateRating?.ratingValue),
      review_count:
        typeof entity.aggregateRating?.ratingCount === "number" ? entity.aggregateRating.ratingCount : null,
      source: "brabyggare.se",
    },
    prefilled: shouldSkipEnrichment({ domain, email, phone }),
  };
}
