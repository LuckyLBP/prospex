import { describe, expect, it } from "vitest";
import { findWebsiteByName, nameMatches, nameTokens, pickPlace } from "./places";

describe("nameMatches", () => {
  it("ignores company forms, case, punctuation and the word 'och'", () => {
    expect(nameMatches("Elektriker Blomqvist AB", "Elektriker Blomqvist")).toBe(true);
    expect(nameMatches("Ekonomi & Fasader i Sverige AB", "Ekonomi och Fasader i Sverige")).toBe(true);
    expect(nameMatches("NOOK'S ENTREPRENAD AKTIEBOLAG", "Nook's Entreprenad")).toBe(true);
  });
  it("treats å, ä and ö like the plain letters on both sides", () => {
    expect(nameMatches("Rörande Rör AB", "Rorande Ror")).toBe(true);
    expect(nameMatches("Måleri Östergötland HB", "Maleri Ostergotland")).toBe(true);
  });
  it("accepts a longer name that contains a shorter one of at least two words", () => {
    expect(nameMatches("Svensson Bygg", "Svensson Bygg & Måleri i Skåne")).toBe(true);
  });
  it("does not accept a single shared word, or a different company with a similar name", () => {
    expect(nameMatches("Bygg AB", "Bygg & Måleri AB")).toBe(false);
    expect(nameMatches("Svensson Bygg AB", "Andersson Bygg AB")).toBe(false);
    expect(nameMatches("Hemstäd Stockholm AB", "Hemstäd Göteborg")).toBe(false);
  });
  it("matches exactly equal single words, and never an empty name", () => {
    expect(nameMatches("Tunbygg AB", "Tunbygg")).toBe(true);
    expect(nameMatches("AB", "AB")).toBe(false);
    expect(nameMatches("", "Något")).toBe(false);
  });
  it("lists tokens without duplicates", () => {
    expect(nameTokens("Sven & Sven AB")).toEqual(["sven"]);
  });
});

describe("pickPlace", () => {
  const places = [
    { id: "p1", displayName: { text: "Annan Firma" }, websiteUri: "https://annan.se" },
    { id: "p2", displayName: { text: "Blomqvist Elektriker" }, formattedAddress: "Storgatan 1, Malmö", nationalPhoneNumber: "040-12 34 56" },
    { id: "p3", displayName: { text: "Blomqvist Elektriker" }, websiteUri: "http://www.blomqvist-el.se/kontakt", businessStatus: "OPERATIONAL" },
    { id: "p4", displayName: { text: "Blomqvist Elektriker" }, websiteUri: "https://stangd.se", businessStatus: "CLOSED_PERMANENTLY" },
  ];
  it("takes a matching place with a website before one without", () => {
    expect(pickPlace(places, "Blomqvist Elektriker AB")).toMatchObject({ placeId: "p3", domain: "blomqvist-el.se" });
  });
  it("skips places that are permanently closed, and ones with another name", () => {
    expect(pickPlace([places[0], places[3]], "Blomqvist Elektriker AB")).toBeNull();
  });
  it("falls back to a matching place without a website", () => {
    expect(pickPlace([places[1]], "Blomqvist Elektriker AB")).toMatchObject({ placeId: "p2", domain: null, phone: "+4640123456", address: "Storgatan 1, Malmö" });
  });
});

describe("findWebsiteByName", () => {
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  it("sends one request with name and city, and returns the matching place", async () => {
    let seen: { body: string; key: string | null } | null = null;
    const fake = (async (_u: string, init: RequestInit) => {
      seen = { body: String(init.body), key: new Headers(init.headers).get("X-Goog-Api-Key") };
      return new Response(JSON.stringify({ places: [{ id: "x", displayName: { text: "Tunbygg" }, websiteUri: "https://tunbygg.se" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const hit = await findWebsiteByName("Tunbygg AB", "Uppsala", { fetch: fake, apiKey: "k" });
    expect(hit).toMatchObject({ domain: "tunbygg.se" });
    expect(JSON.parse(seen!.body)).toMatchObject({ textQuery: "Tunbygg AB Uppsala", regionCode: "SE", languageCode: "sv" });
    expect(seen!.key).toBe("k");
  });
  it("makes no request without an API key, and gives null on errors and empty answers", async () => {
    let calls = 0;
    const counting = (async () => { calls++; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    expect(await findWebsiteByName("X AB", null, { fetch: counting, apiKey: undefined })).toBeNull();
    expect(calls).toBe(0);
    expect(await findWebsiteByName("X AB", null, { fetch: ok({}), apiKey: "k" })).toBeNull();
    expect(await findWebsiteByName("X AB", null, { fetch: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch, apiKey: "k" })).toBeNull();
    expect(await findWebsiteByName("X AB", null, { fetch: (async () => { throw new Error("nät"); }) as unknown as typeof fetch, apiKey: "k" })).toBeNull();
  });
});

describe("pickPlace with the site's domain", () => {
  const brand = [{ id: "p9", displayName: { text: "Varumärket" }, formattedAddress: "Gatan 1", websiteUri: "https://www.foretaget.se/", rating: 4.5, userRatingCount: 12, regularOpeningHours: { weekdayDescriptions: ["måndag: 08:00–16:00"] }, primaryTypeDisplayName: { text: "Frisör" } }];
  it("accepts a place whose website is the company's own domain even when the name differs", () => {
    expect(pickPlace(brand, "Helt Annat Namn AB")).toBeNull();
    expect(pickPlace(brand, "Helt Annat Namn AB", "foretaget.se")).toMatchObject({ placeId: "p9", rating: 4.5, ratingCount: 12, category: "Frisör", hours: ["måndag: 08:00–16:00"] });
  });
  it("works with only a domain and no registry name", () => {
    expect(pickPlace(brand, null, "foretaget.se")).toMatchObject({ placeId: "p9" });
    expect(pickPlace(brand, null, "annat.se")).toBeNull();
  });
});

