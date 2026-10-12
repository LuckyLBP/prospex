import type { CollectedItem } from "../types";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";
import { isValidOrgNumber, normalizeOrgNumber } from "@/lib/enrich/orgnr";

// Tolkning av Servicefinder-sidor, skild från skriptet så att den går att testa utan nätverk.
//
// Varje aktiv företagsprofil (/foretag/<id>) har ett schema.org-block av typen LocalBusiness med namn,
// telefon, org.nr (taxID), betyg och de kommuner företaget täcker. Det är vad sajten publicerar för
// sökmotorer, så det är det stabilaste på sidan. Inaktiva profiler saknar blocket (404 eller en tom sida).

export interface ServiceFinderProfile {
  id: string;
  url: string;
  name: string;
  phone: string | null;
  /** null för enskilda firmor, där sajten maskerar personnumret (670406****). */
  orgnr: string | null;
  reviews: number | null;
  rating: number | null;
  areas: string[];
}

const LOC = /<loc>\s*(https?:\/\/(?:www\.)?servicefinder\.se\/foretag\/(\d+))\s*<\/loc>/gi;

/** Profil-URL:er ur en sitemap, utan dubbletter, i ordning. */
export function parseSitemapProfiles(xml: string): { id: string; url: string }[] {
  const seen = new Set<string>();
  const out: { id: string; url: string }[] = [];
  for (const m of xml.matchAll(LOC)) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    out.push({ id: m[2], url: m[1] });
  }
  return out;
}

const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;

type Obj = Record<string, unknown>;

/** Företaget på en profilsida, eller null när sidan inte har något LocalBusiness-block. */
export function parseProfile(html: string, id: string): ServiceFinderProfile | null {
  for (const m of html.matchAll(LD)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    for (const node of Array.isArray(data) ? data : [data]) {
      const o = node as Obj;
      if (!o || o["@type"] !== "LocalBusiness") continue;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) return null;

      const tax = typeof o.taxID === "string" ? o.taxID.trim() : "";
      const orgnr = /^\d{10}$/.test(tax) || /^\d{6}-\d{4}$/.test(tax) ? normalizeOrgNumber(tax) : null;

      const rating = o.aggregateRating as Obj | undefined;
      const reviews = Number(rating?.reviewCount);
      const value = Number(rating?.ratingValue);
      const areas = Array.isArray(o.areaServed)
        ? (o.areaServed as Obj[]).map((a) => (typeof a?.name === "string" ? a.name : "")).filter(Boolean)
        : [];

      return {
        id,
        url: `https://servicefinder.se/foretag/${id}`,
        name,
        phone: normalizeSwedishPhone(typeof o.telephone === "string" ? o.telephone : null),
        orgnr: orgnr && isValidOrgNumber(orgnr) ? orgnr : null,
        reviews: Number.isFinite(reviews) ? reviews : null,
        rating: Number.isFinite(value) ? value : null,
        areas,
      };
    }
  }
  return null;
}

/**
 * Företaget som en post. Ett företag vi redan har (på org.nr, eller telefon för enskilda firmor) behåller sin
 * nyckel, så att det fylls på och inte dubbleras.
 */
export function toItem(p: ServiceFinderProfile, known: { byOrg: Map<string, string>; byPhone: Map<string, string> }): CollectedItem {
  const key = (p.orgnr && known.byOrg.get(p.orgnr)) || (!p.orgnr && p.phone && known.byPhone.get(p.phone)) || `servicefinder:${p.id}`;
  return {
    dedupeKey: key,
    domain: null,
    companyName: p.name,
    phone: p.phone,
    orgnr: p.orgnr,
    sourceUrl: p.url,
    raw: { servicefinder_id: p.id, reviews: p.reviews, rating: p.rating, areas: p.areas.slice(0, 40) },
    // Ingen webbplats att besöka.
    prefilled: true,
  };
}

