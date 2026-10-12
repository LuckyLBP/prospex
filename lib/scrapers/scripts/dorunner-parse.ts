import { normalizeDomain, websiteUrl } from "../domain";
import type { CollectedItem } from "../types";
import { decodeEntities } from "@/lib/enrich/extract";
import { shouldSkipEnrichment } from "./prefill";

// Tolkning av Dorunners sidor, skild från skriptet så att den går att testa utan nätverk.
//
// Katalogen (/katalog?page=N) listar 50 företag per sida med vanliga länkar till /företag/<namn>-<id>.
// Sitemapen (sitemap/profiles_0.xml) listar de flesta av samma profiler, men inte alla, så vi tar båda.
// En profil har ett schema.org-block av typen LocalBusiness (namn, betyg) och en länk till företagets
// egen webbplats. Telefon och org.nr på sidan är Dorunners egna (sidhuvud och sidfot), inte företagets,
// och hämtas inte härifrån: webbplatsen berikas efteråt.

const PROFILE_LINK = /https:\/\/(?:www\.)?dorunner\.se\/f(?:%C3%B6|ö)retag\/[^"'<>\s]+-(\d+)(?=["'<>\s]|$)/gi;
const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;

/** Adresser vi aldrig tolkar som företagets egen webbplats. */
const NOT_THE_COMPANY = /(?:^|\.)(?:dorunner\.se|google\.[a-z.]+|gstatic\.com|googleapis\.com|googletagmanager\.com|facebook\.com|instagram\.com|linkedin\.com|youtube\.com|twitter\.com|x\.com|termly\.io|addrevenue\.io|trustpilot\.com|apple\.com|bankid\.com|klarna\.com|swish\.nu|schema\.org|w3\.org)$/i;

export interface DorunnerProfile {
  id: string;
  url: string;
  name: string;
  domain: string | null;
  rating: number | null;
  reviews: number | null;
}

/** Profil-URL:er (en per id) ur en katalogsida eller sitemap, i ordning. */
export function parseProfileLinks(text: string): { id: string; url: string }[] {
  const seen = new Set<string>();
  const out: { id: string; url: string }[] = [];
  for (const m of text.replace(/wire:snapshot="[^"]*"/g, "").matchAll(PROFILE_LINK)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], url: m[0] });
  }
  return out;
}

type Obj = Record<string, unknown>;

function businessBlock(html: string): Obj | null {
  for (const m of html.matchAll(LD)) {
    try {
      const data = JSON.parse(m[1]);
      for (const node of Array.isArray(data) ? data : [data]) if (node && (node as Obj)["@type"] === "LocalBusiness") return node as Obj;
    } catch {
      /* ett trasigt block hoppas över */
    }
  }
  return null;
}

/** Företagets egen webbplats: första externa länken som inte är Dorunner, sociala medier eller ett skript. */
function companyDomain(html: string): string | null {
  for (const m of html.matchAll(/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/gi)) {
    const domain = normalizeDomain(m[1]);
    if (domain && !NOT_THE_COMPANY.test(domain)) return domain;
  }
  return null;
}

export function parseProfile(html: string, id: string, url: string): DorunnerProfile | null {
  const ld = businessBlock(html);
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  const name = (typeof ld?.name === "string" ? ld.name : title ? decodeEntities(title).replace(/\s+-\s+Hitta din expert\s*$/i, "") : "").trim();
  if (!name) return null;
  const rating = ld?.aggregateRating as Obj | undefined;
  const value = Number(rating?.ratingValue);
  const reviews = Number(rating?.reviewCount);
  return { id, url, name, domain: companyDomain(html), rating: Number.isFinite(value) && rating ? value : null, reviews: Number.isFinite(reviews) && rating ? reviews : null };
}

/** Profilen som en post. Utan webbplats får företaget en nyckel av Dorunner-id och ingen berikning köas. */
export function toItem(p: DorunnerProfile): CollectedItem {
  const email = null;
  const phone = null;
  return {
    dedupeKey: p.domain ?? `dorunner:${p.id}`,
    domain: p.domain,
    website: p.domain ? websiteUrl(p.domain) : null,
    sourceUrl: p.url,
    companyName: p.name,
    phone,
    email,
    raw: { dorunner_id: p.id, rating: p.rating, reviews: p.reviews },
    prefilled: shouldSkipEnrichment({ domain: p.domain, email, phone }),
  };
}
