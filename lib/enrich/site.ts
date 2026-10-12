import { extractContacts, isInterstitial, type ExtractedContacts } from "./extract";
import { auditSite, type SiteAudit } from "./audit";
import { websiteUrl } from "@/lib/scrapers/domain";

/**
 * Visiting one collected domain to find out who owns it.
 *
 * THE RULES ARE ALL ABOUT NOT BEING HELD UP. This runs a few hundred times per
 * invocation against sites nobody controls: parked domains that never answer,
 * pages that stream megabytes of markup, hosts that redirect in a circle. Any
 * one of them would otherwise spend the whole run's time budget.
 *
 *   8 s per request      a site slower than that is not worth the invocation
 *   512 kB per response  read as a stream and abandoned at the cap
 *   HTML only            a PDF or an image has nothing for the extractor
 *
 * A failure here is never a run failure. The record gets its enrich_error and
 * the pass moves on -- half a list of leads is worth having.
 */

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 512_000;

// Identifies the crawler and says who to contact, which is what a site owner
// who sees it in their logs needs.
const USER_AGENT =
  "Mozilla/5.0 (compatible; EffektivMediaBot/1.0; +https://effektivmedia.nu)";

export interface EnrichedSite extends ExtractedContacts {
  website: string | null;
  error: string | null;
  /** Read off the same home page; null when there was no page to read. */
  audit: SiteAudit | null;
}

interface FetchedPage {
  html: string;
  finalUrl: string;
}

export interface SiteFetcher {
  fetch: typeof globalThis.fetch;
}

/** One request, capped in both time and size. Returns null for anything unusable. */
export async function fetchPage(
  url: string,
  deps: SiteFetcher = { fetch: globalThis.fetch },
): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await deps.fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) return null;

    const type = response.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml/i.test(type)) return null;

    const html = await readCapped(response);
    if (!html) return null;

    return { html, finalUrl: response.url || url };
  } catch {
    // Timeout, DNS failure, TLS error, connection reset -- all the same thing
    // from here: this domain did not answer.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads at most MAX_BYTES, then stops pulling from the stream. */
export async function readCapped(response: Response): Promise<string | null> {
  const body = response.body;
  if (!body) return null;

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  const chunks: string[] = [];
  let total = 0;

  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } catch {
    return chunks.length > 0 ? chunks.join("") : null;
  } finally {
    // Tell the far end we are done; without this the socket stays open until
    // the whole body arrives, cap or no cap.
    await reader.cancel().catch(() => {});
  }

  const html = chunks.join("");
  return html.trim() === "" ? null : html;
}

/**
 * The pages worth trying, in order. The home page usually carries the name
 * and often a phone number; the contact page is where an email and an org
 * number live when the home page has neither.
 */
const CONTACT_PATHS = ["/kontakt", "/kontakta-oss", "/contact"];

export async function enrichDomain(
  domain: string,
  deps: SiteFetcher = { fetch: globalThis.fetch },
): Promise<EnrichedSite> {
  const empty: ExtractedContacts = {
    companyName: null,
    email: null,
    phone: null,
    orgnr: null,
    emails: [],
    phones: [],
  };

  // https first: a site that only speaks http is rare enough that paying for
  // a second request in that case is cheaper than paying for http everywhere.
  const home =
    (await fetchPage(websiteUrl(domain), deps)) ?? (await fetchPage(`http://${domain}`, deps));

  if (!home) {
    return { ...empty, website: null, error: "Webbplatsen svarade inte.", audit: null };
  }

  // Storing an empty record for a challenge page would say "this company has no
  // contact details", which is a different and wrong claim.
  if (isInterstitial(home.html)) {
    return {
      ...empty,
      website: home.finalUrl,
      error: "Webbplatsen svarade med en robotkontroll i stället för sidan.",
      audit: null,
    };
  }

  let found = extractContacts(home.html, domain);

  // A contact page is only worth a request when something is still missing.
  if (!found.email || !found.phone || !found.orgnr) {
    for (const path of CONTACT_PATHS) {
      const page = await fetchPage(new URL(path, home.finalUrl).toString(), deps);
      if (!page) continue;
      const extra = extractContacts(page.html, domain);
      found = {
        companyName: found.companyName ?? extra.companyName,
        email: found.email ?? extra.email,
        phone: found.phone ?? extra.phone,
        orgnr: found.orgnr ?? extra.orgnr,
        emails: [...new Set([...found.emails, ...extra.emails])],
        phones: [...new Set([...found.phones, ...extra.phones])],
      };
      break;
    }
  }

  return { ...found, website: home.finalUrl, error: null, audit: auditSite(home.html, home.finalUrl) };
}

/**
 * The home page alone, audited. For records enriched before the audit existed
 * (the worker's audit stage) and for the pitch, which wants the page text too.
 */
export async function fetchHome(
  domain: string,
  website: string | null,
  deps: SiteFetcher = { fetch: globalThis.fetch },
): Promise<{ html: string; finalUrl: string; audit: SiteAudit } | null> {
  const home =
    (await fetchPage(website ?? websiteUrl(domain), deps)) ??
    (website ? null : await fetchPage(`http://${domain}`, deps));
  if (!home || isInterstitial(home.html)) return null;
  return { ...home, audit: auditSite(home.html, home.finalUrl) };
}
