import { decodeEntities } from "@/lib/enrich/extract";
import { PageBudget, safeFetch } from "@/lib/profile/safe-fetch";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { isSameOrSubdomain, type Agency } from "./match";

// Byråns egen webbplats som källa, utan Claude: startsidans kundlogotyper (bildernas alt-texter är kundernas namn),
// kundcase-sidorna (var och en länkar till kundens webbplats) och sitemappen. Allt är förslag. Namn utan länk blir
// gissade domäner, och verifieringen (verify.ts) avgör om kunden verkligen har byrån i sin sidfot.

const KUND_PATH = /kund|referens|case|portfolio|projekt|arbete|work/i;
const MAX_PAGES = 40;
/** Sidor som listar alla kundcase. */
const LISTING_PATH = /^\/(?:kundcase|referenser|referens|kunder|cases?|portfolio|projekt)\/?$/i;
/** Länkar som aldrig är en kund: sociala medier, kartor, betygsmärken, verktyg och byråns egna adresser. */
const NOT_CUSTOMER = /(?:^|\.)(?:facebook|instagram|linkedin|youtube|twitter|x|tiktok|pinterest|google|goo|gstatic|googleapis|cloudflare|cloudflare|wordpress|w|schema|uc|cookiebot|usercentrics|gmpg|fonts|jsdelivr|unpkg|bit|maps|apple|microsoft|trustpilot|reco)\.(?:com|se|org|net|ly|gl|app)$/i;
/** Alt-texter som beskriver bilder och märken, inte en kund. */
const ALT_NOISE = /logo|logotyp|ikon|icon|sigill|badge|illustration|illustation|bakgrund|bakgrunds|animerad|cookiebot|partner|google|facebook|instagram|linkedin|fbpx|ballong|växter|växt|knapp|kurvert|upplägg|service|tallrik|högtalare|certified|bild på|foto|symbol|pil|arrow/i;

export interface SiteReaderDeps {
  safeFetch: typeof safeFetch;
}
export const defaultSiteReaderDeps: SiteReaderDeps = { safeFetch };

export interface SiteFinding {
  domain: string;
  /** Sidan på byråns webbplats som pekade ut kunden. */
  sourceUrl: string;
  how: "case-link" | "name-guess";
  name?: string;
}

const hrefs = (html: string): string[] => [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1]).trim());
const abs = (href: string, base: string): string | null => {
  try {
    return new URL(href.startsWith("//") ? `https:${href}` : href, base).toString();
  } catch {
    return null;
  }
};

/** Kundens domän ur ett externt länkmål, eller null när det inte är en kund. Ren. */
export function customerDomainOf(url: string, agency: Agency): string | null {
  const d = normalizeDomain(url);
  if (!d || isSameOrSubdomain(d, agency.domain) || NOT_CUSTOMER.test(d)) return null;
  return d;
}

/** Namn ur bildernas alt-texter på en sida, utan beskrivande bildtexter och dubbletter. Ren. */
export function logoNames(html: string): string[] {
  const names = new Set<string>();
  for (const m of html.matchAll(/<img\b[^>]*\balt\s*=\s*["']([^"']{3,50})["']/gi)) {
    const alt = decodeEntities(m[1]).replace(/[¨"“”]/g, "").replace(/\s+/g, " ").trim();
    if (alt.length < 3 || ALT_NOISE.test(alt) || /^\d+$/.test(alt) || alt.split(" ").length > 4) continue;
    names.add(alt);
  }
  return [...names];
}

/** Några rimliga domäner för ett företagsnamn: "Rubinpool" ger rubinpool.se och rubinpool.com. Ren. */
export function guessDomains(name: string): string[] {
  const slug = name.toLowerCase().replace(/å|ä/g, "a").replace(/ö/g, "o").replace(/é|è/g, "e").replace(/&/g, "").replace(/\b(ab|aktiebolag|hb|kb)\b/g, "").replace(/[^a-z0-9]+/g, "");
  if (slug.length < 3) return [];
  const dashed = name.toLowerCase().replace(/å|ä/g, "a").replace(/ö/g, "o").replace(/é|è/g, "e").replace(/&/g, " ").replace(/\b(ab|aktiebolag|hb|kb)\b/g, "").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [...new Set([`${slug}.se`, `${slug}.com`, ...(dashed !== slug ? [`${dashed}.se`] : [])])];
}

/**
 * Läser byråns webbplats och ger kundförslag. Hämtar startsidan, kundsidor den länkar till och sitemappens
 * kundcase, högst MAX_PAGES sidor. Fel på en sida hoppas över.
 */
export async function readAgencySite(agency: Agency, deps: SiteReaderDeps = defaultSiteReaderDeps): Promise<{ findings: SiteFinding[]; pages: number }> {
  const budget = new PageBudget(MAX_PAGES + 3, 0);
  const base = `https://${agency.domain}/`;
  const fetchHtml = async (url: string): Promise<{ html: string; finalUrl: string } | null> => {
    const p = await deps.safeFetch(url, agency.domain, budget).catch(() => null);
    return p?.html ? { html: p.html, finalUrl: p.finalUrl } : null;
  };

  const home = await fetchHtml(base);
  if (!home) return { findings: [], pages: 0 };

  // Kundsidor: länkar på startsidan som ser ut som kunder eller case, och sitemappens motsvarigheter.
  const pages = new Set<string>();
  const sameSite = (u: string) => { try { return isSameOrSubdomain(new URL(u).hostname, agency.domain); } catch { return false; } };
  for (const h of hrefs(home.html)) {
    const u = abs(h, home.finalUrl);
    if (u && sameSite(u) && KUND_PATH.test(new URL(u).pathname) && !/\.(?:pdf|jpe?g|png|webp|svg)$/i.test(u)) pages.add(u.replace(/#.*$/, ""));
  }
  const sitemap = await fetchHtml(`${base}sitemap.xml`).catch(() => null);
  for (const m of sitemap?.html.matchAll(/<loc>([^<]+)<\/loc>/gi) ?? []) {
    const u = m[1].trim();
    if (sameSite(u) && KUND_PATH.test(new URL(u).pathname)) pages.add(u);
  }

  const findings = new Map<string, SiteFinding>();
  const names = new Map<string, string>();
  for (const n of logoNames(home.html)) names.set(n.toLowerCase(), n);

  // På en sida som listar alla kundcase följer vi också dess egna länkar ett steg: varje case ligger på en egen sida
  // vars adress oftast inte innehåller ordet kund eller case (till exempel /brf24/).
  const queue = [...pages];
  const seen = new Set(queue);
  for (let i = 0; i < queue.length && i < MAX_PAGES; i++) {
    const url = queue[i];
    const page = await fetchHtml(url);
    if (!page) continue;
    if (LISTING_PATH.test(new URL(url).pathname)) {
      for (const h of hrefs(page.html)) {
        const u = abs(h, page.finalUrl)?.replace(/#.*$/, "");
        if (u && sameSite(u) && !seen.has(u) && !/\.(?:pdf|jpe?g|png|webp|svg|xml)$/i.test(u) && !/\/(?:feed|wp-json|category|tag|author)\b/i.test(u)) {
          seen.add(u);
          queue.push(u);
        }
      }
    }
    for (const h of hrefs(page.html)) {
      const u = abs(h, page.finalUrl);
      const domain = u ? customerDomainOf(u, agency) : null;
      if (domain && !findings.has(domain)) findings.set(domain, { domain, sourceUrl: url, how: "case-link" });
    }
    for (const n of logoNames(page.html)) names.set(n.toLowerCase(), n);
  }

  // Namn utan länk: gissa domäner. Vad som helst som inte har byrån i sidfoten faller bort vid verifieringen.
  const have = new Set(findings.keys());
  const labels = new Set([...findings.keys()].map((d) => d.split(".")[0].replace(/-/g, "")));
  for (const name of names.values()) {
    const guesses = guessDomains(name);
    // Ett namn som redan har en riktig länk behöver inga gissningar.
    if (guesses.length > 0 && labels.has(guesses[0].split(".")[0])) continue;
    for (const g of guesses) {
      if (!have.has(g) && !isSameOrSubdomain(g, agency.domain)) {
        have.add(g);
        findings.set(g, { domain: g, sourceUrl: home.finalUrl, how: "name-guess", name });
      }
    }
  }
  return { findings: [...findings.values()], pages: budget.used };
}
