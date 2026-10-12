import { CollectorError, type CollectBatch, type CollectedItem, type Collector, type CollectContext } from "./types";
import { normalizeDomain, websiteUrl } from "./domain";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";
import { googleplacesConfigSchema, type GoogleplacesConfig } from "@/lib/sources/schema";

// Google Places (New), Text Search.
//
// Eniro and Hitta block requests from serverless IP ranges; Places is an API
// and does not. Each search is "<term> i <place>" with regionCode SE, and every
// hit carries the three things a salesperson needs -- name, phone, website --
// so a record usually arrives needing only an email from the enrichment visit.
//
// THE FIELD MASK DECIDES THE PRICE. Requesting phone numbers or websites puts a
// call in Google's Enterprise tier, whose free allowance is 1 000 requests a
// month. That is why a page is one request, why pages are capped at three, and
// why the schedule refreshes this method monthly rather than weekly.

export const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",");
const PAGE_SIZE = 20;

interface Place {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
}

interface SearchResponse {
  places?: Place[];
  nextPageToken?: string;
  error?: { message?: string; status?: string };
}

export interface GoogleplacesDeps {
  fetch: typeof globalThis.fetch;
  apiKey: string | undefined;
}

function defaultDeps(): GoogleplacesDeps {
  return { fetch: globalThis.fetch, apiKey: process.env.GOOGLE_PLACES_API_KEY };
}

/** Exported for tests: pasted lines -> trimmed, unique, non-empty lines. */
export function parseLines(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Exported for tests: one Places result -> a collected item, or null when it
 * should not become a record (closed for good, or nothing to identify it by).
 *
 * The key is the website's domain where there is one, so a firm found through
 * three searches -- or already collected by another method -- is one record.
 * Without a website the Places id stands in, which keeps a re-run an update.
 */
export function toItem(place: Place, query: string, location: string): CollectedItem | null {
  if (!place.id) return null;
  if (place.businessStatus === "CLOSED_PERMANENTLY") return null;

  const domain = normalizeDomain(place.websiteUri);
  const phone = normalizeSwedishPhone(place.internationalPhoneNumber ?? place.nationalPhoneNumber);

  return {
    dedupeKey: domain ?? `googleplaces:${place.id}`,
    domain,
    website: domain ? websiteUrl(domain) : null,
    sourceUrl: place.googleMapsUri ?? null,
    companyName: place.displayName?.text ?? null,
    phone,
    raw: {
      placeId: place.id,
      address: place.formattedAddress ?? null,
      type: place.primaryTypeDisplayName?.text ?? null,
      query,
      location,
    },
    prefilled: false,
  };
}

interface PlacesCursor {
  /** Index into the queries x locations grid. */
  pair: number;
  pageToken: string | null;
  /** Which page of the current pair this request is, from 1. */
  page: number;
}

function readCursor(raw: unknown): PlacesCursor {
  const fresh: PlacesCursor = { pair: 0, pageToken: null, page: 1 };
  if (!raw || typeof raw !== "object") return fresh;
  const { pair, pageToken, page } = raw as Record<string, unknown>;
  const pairNumber = Number(pair);
  const pageNumber = Number(page);
  if (!Number.isInteger(pairNumber) || pairNumber < 0) return fresh;
  return {
    pair: pairNumber,
    pageToken: typeof pageToken === "string" && pageToken !== "" ? pageToken : null,
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
  };
}

export function createGoogleplacesCollector(
  deps: GoogleplacesDeps = defaultDeps(),
): Collector<GoogleplacesConfig> {
  return {
    method: "googleplaces",

    parseConfig(raw) {
      const parsed = googleplacesConfigSchema.safeParse(raw);
      if (!parsed.success) {
        throw new CollectorError("Profilens Google Places-inställningar är ofullständiga. Redigera profilen.");
      }
      return parsed.data;
    },

    async *collect(config: GoogleplacesConfig, ctx: CollectContext): AsyncGenerator<CollectBatch> {
      if (!deps.apiKey) {
        throw new CollectorError("GOOGLE_PLACES_API_KEY saknas i miljön.");
      }

      const queries = parseLines(config.queries);
      const locations = parseLines(config.locations);
      const pairs = queries.flatMap((query) => locations.map((location) => ({ query, location })));
      if (pairs.length === 0) {
        throw new CollectorError("Inga söktermer eller orter att söka på.");
      }

      let { pair, pageToken, page } = readCursor(ctx.cursor);
      ctx.log(`Google Places: ${pairs.length} sökningar, från ${pair + 1}`);

      while (pair < pairs.length) {
        const { query, location } = pairs[pair];
        const textQuery = `${query} i ${location}`;
        ctx.log(`Google Places "${textQuery}" sida ${page}`);

        let response: Response;
        try {
          response = await deps.fetch(ENDPOINT, {
            method: "POST",
            signal: ctx.signal,
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": deps.apiKey,
              "X-Goog-FieldMask": FIELD_MASK,
            },
            body: JSON.stringify({
              textQuery,
              regionCode: "SE",
              languageCode: "sv",
              pageSize: PAGE_SIZE,
              ...(pageToken ? { pageToken } : {}),
            }),
          });
        } catch (cause) {
          throw new CollectorError(
            `Kunde inte nå Google Places: ${cause instanceof Error ? cause.message : "okänt fel"}`,
          );
        }

        let body: SearchResponse;
        try {
          body = (await response.json()) as SearchResponse;
        } catch {
          throw new CollectorError(`Google Places svarade ${response.status} utan JSON.`);
        }

        if (!response.ok || body.error) {
          const reason = body.error?.message ?? `status ${response.status}`;
          throw new CollectorError(
            response.status === 403 || response.status === 400
              ? `Google Places nekade anropet (${reason}). Kontrollera API-nyckeln och att Places API (New) är aktiverat.`
              : `Google Places: ${reason}`,
          );
        }

        const items: CollectedItem[] = [];
        const seen = new Set<string>();
        for (const place of body.places ?? []) {
          const item = toItem(place, query, location);
          if (!item || seen.has(item.dedupeKey)) continue;
          seen.add(item.dedupeKey);
          items.push(item);
        }

        const more = Boolean(body.nextPageToken) && page < config.maxPages;
        if (more) {
          pageToken = body.nextPageToken ?? null;
          page += 1;
        } else {
          pair += 1;
          pageToken = null;
          page = 1;
        }

        const done = pair >= pairs.length;
        yield { items, cursor: done ? null : { pair, pageToken, page } };
        if (done) return;
      }
    },
  };
}
