import { normalizeDomain, websiteUrl } from "../domain";
import type { CollectedItem } from "../types";
import { decodeEntities } from "@/lib/enrich/extract";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";
import { shouldSkipEnrichment } from "./prefill";

// Tolkning av Boka.se-sidor, skild från skriptet så att den går att testa utan nätverk.
//
// Sitemapen (sitemap-bookingsystems.xml) listar företagens bokningssidor som boka.se/<namn>. Varje sida har en
// informationsruta (basic-info-container) med företagsnamnet i en h1, och under den telefon (tel:-länk),
// adress (länk till Google Maps) och företagets egen webbplats. Länkarna till sociala medier ligger i ett eget
// block efter, och ingår inte. Sidorna har varken org.nr eller e-post, så de hämtas av berikningen via webbplatsen.

export interface BokaProfile {
  slug: string;
  url: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  domain: string | null;
}

const LOC = /<loc>\s*https:\/\/(?:www\.)?boka\.se\/([^\/<\s]+)\s*<\/loc>/gi;

/** Bokningssidornas namn ur sitemapen, utan dubbletter, i ordning. Sidor med fler led (/event/...) ingår inte. */
export function parseSitemapSlugs(xml: string): { slug: string; url: string }[] {
  const seen = new Set<string>();
  const out: { slug: string; url: string }[] = [];
  for (const m of xml.matchAll(LOC)) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, url: `https://boka.se/${slug}` });
  }
  return out;
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseProfile(html: string, slug: string): BokaProfile | null {
  const start = html.indexOf("basic-info-container");
  if (start === -1) return null;
  let box = html.slice(start);
  const end = box.indexOf("</section>");
  if (end !== -1) box = box.slice(0, end);
  // Sociala medier ligger i ett eget block efter kontaktuppgifterna.
  const social = box.indexOf("social-media-icons");
  const info = social === -1 ? box : box.slice(0, social);

  const name = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(info)?.[1] ?? "");
  if (!name) return null;

  const tel = /href="tel:([^"]+)"/i.exec(info)?.[1];
  const mail = /href="mailto:([^"]+)"/i.exec(info)?.[1];
  const address = /aria-label="Google maps - ([^"]+)"/i.exec(info)?.[1];

  let domain: string | null = null;
  for (const m of info.matchAll(/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/gi)) {
    const href = decodeEntities(m[1]);
    if (/google\.[a-z.]+\/maps|(?:^|\/\/)(?:www\.)?boka\.se/i.test(href)) continue;
    domain = normalizeDomain(href);
    if (domain) break;
  }

  return {
    slug,
    url: `https://boka.se/${slug}`,
    name,
    phone: normalizeSwedishPhone(tel ? decodeEntities(tel) : null),
    email: mail ? decodeEntities(mail).trim().toLowerCase() || null : null,
    address: address ? clean(address) : null,
    domain,
  };
}

/**
 * Företaget som en post. Med webbplats är domänen nyckeln. Utan webbplats får ett företag vars telefonnummer
 * bara finns hos ett företag hos oss den nyckeln, annars `boka:<namn>`.
 */
export function toItem(p: BokaProfile, byPhone: Map<string, string> = new Map()): CollectedItem {
  const dedupeKey = p.domain ?? (p.phone && byPhone.get(p.phone)) ?? `boka:${decodeURIComponent(p.slug)}`;
  return {
    dedupeKey,
    domain: p.domain,
    website: p.domain ? websiteUrl(p.domain) : null,
    sourceUrl: p.url,
    companyName: p.name,
    phone: p.phone,
    email: p.email,
    raw: { boka_slug: decodeURIComponent(p.slug), address: p.address },
    prefilled: shouldSkipEnrichment({ domain: p.domain, email: p.email, phone: p.phone }),
  };
}
