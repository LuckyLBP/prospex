import { describe, expect, it, vi } from "vitest";
import { checkCompany, classifyPlaces, domainLabel, isPlaceholderPhone, looksLikeBusinessName, placeIsCompany, placeNameMatches, placesResembleCompany, siteLinksGoogleProfile, type RawPlace } from "./check";

const place = (name: string, address = "Storgatan 1, 411 01 Göteborg", status = "OPERATIONAL"): RawPlace => ({ id: `id-${name}`, displayName: { text: name }, formattedAddress: address, businessStatus: status, googleMapsUri: `https://maps.google.com/?cid=${name.length}` });

describe("classifyPlaces", () => {
  it("has a profile when a result has the right name", () => {
    expect(classifyPlaces([place("Täby Bygg & Måleri AB")], { name: "Täby Bygg & Måleri AB" }).state).toBe("has");
    expect(classifyPlaces([place("Täby Bygg och Måleri")], { name: "Täby Bygg & Måleri AB" }).state).toBe("has"); // company form and ampersand do not count
  });
  it("requires the city to match when it is known and the result has an address", () => {
    expect(classifyPlaces([place("Elektrikern AB", "Storgatan 1, Malmö")], { name: "Elektrikern AB", city: "Göteborg" }).state).toBe("unsure"); // same name, wrong city: not sure
    expect(classifyPlaces([place("Elektrikern AB", "Storgatan 1, 411 01 Göteborg")], { name: "Elektrikern AB", city: "Göteborg" }).state).toBe("has");
  });
  it("is none when no result matches, and a single shared word is not a match", () => {
    expect(classifyPlaces([], { name: "Rörmokaren AB" }).state).toBe("none");
    expect(classifyPlaces([place("Bygg Och Måleri Stockholm")], { name: "Bygg AB" }).state).not.toBe("has"); // one shared word is not enough
    expect(classifyPlaces([place("Bygg")], { name: "Bygg AB" }).state).toBe("has"); // but the same single word, without the company form, is
    expect(classifyPlaces([place("Frisör Anna")], { name: "Jannes Kakel AB" }).state).toBe("none");
  });
  it("is closed when the only matching result is permanently closed, and has when another one is open", () => {
    expect(classifyPlaces([place("Kafé Sol", undefined, "CLOSED_PERMANENTLY")], { name: "Kafé Sol" }).state).toBe("closed");
    expect(classifyPlaces([place("Kafé Sol", undefined, "CLOSED_PERMANENTLY"), place("Kafé Sol")], { name: "Kafé Sol" }).state).toBe("has");
  });
});

describe("siteLinksGoogleProfile", () => {
  it("finds the usual ways a site points at its Google profile", () => {
    expect(siteLinksGoogleProfile('<a href="https://g.page/r/CabcDEF/review">Recensera</a>')).toContain("g.page/r/CabcDEF");
    expect(siteLinksGoogleProfile('<a href="https://maps.app.goo.gl/AbC123xyz">Hitta hit</a>')).toContain("maps.app.goo.gl");
    expect(siteLinksGoogleProfile('<a href="https://www.google.com/maps/place/Frisör+Anna/@57.7,11.9">karta</a>')).toContain("/maps/place/");
    expect(siteLinksGoogleProfile('<a href="https://www.google.com/maps?cid=12345678901234567890">karta</a>')).toContain("cid=");
    expect(siteLinksGoogleProfile('<a href="https://search.google.com/local/writereview?placeid=ChIJabc">Skriv</a>')).toContain("placeid=");
  });
  it("does not take an ordinary map embed or an unrelated link for a profile", () => {
    expect(siteLinksGoogleProfile('<iframe src="https://www.google.com/maps/embed?pb=!1m18"></iframe><a href="https://google.com/">g</a>')).toBeNull();
    expect(siteLinksGoogleProfile("<p>Besök oss på Storgatan</p>")).toBeNull();
  });
});

describe("checkCompany", () => {
  const homepage = (html: string | null) => vi.fn(async () => html);
  it("uses the Google result when there is one, without reading the site", async () => {
    const hp = homepage("<a href='https://g.page/x'>");
    const r = await checkCompany({ name: "Täby Bygg AB", domain: "tabybygg.se" }, { search: async () => [place("Täby Bygg AB")], homepage: hp });
    expect(r).toMatchObject({ state: "has", via: "places", placeName: "Täby Bygg AB" });
    expect(hp).not.toHaveBeenCalled();
  });
  it("falls back to the company's own link to its profile when Google finds nothing under that name", async () => {
    const r = await checkCompany({ name: "Legal Name AB", domain: "brand.se" }, { search: async () => [], homepage: homepage('<a href="https://g.page/brand/review">Betygsätt</a>') });
    expect(r).toMatchObject({ state: "has", via: "site-link" });
  });
  it("says none only when Google finds nothing and the site shows no link", async () => {
    const r = await checkCompany({ name: "Rörmokaren Kjell AB", domain: "kjell.se" }, { search: async () => [], homepage: homepage("<p>Hej</p>") });
    expect(r).toMatchObject({ state: "none", mapsUrl: null });
  });
  it("gives null when the search itself failed, so nothing is wrongly marked", async () => {
    expect(await checkCompany({ name: "X AB", domain: "x.se" }, { search: async () => null, homepage: homepage(null) })).toBeNull();
  });
  it("adds the city to the query when it is known", async () => {
    const search = vi.fn(async () => []);
    await checkCompany({ name: "Elektrikern AB", city: "Umeå" }, { search, homepage: homepage(null) });
    expect(search).toHaveBeenCalledWith("Elektrikern AB Umeå");
  });
});

describe("placeNameMatches with the company's own domain as support (real misses from the first test)", () => {
  const m = (name: string, domain: string, place: string) => placeNameMatches({ name, domain }, place);
  it("matches a keyword stuffed Google name when the company is named like its domain", () => {
    expect(m("Carmag AB", "carmag.se", "Carmag AB | Bygg, trädgård & bevattning")).toBe(true);
    expect(m("Freshup", "freshup.se", "Freshup Barbers")).toBe(true);
    expect(m("WEAB", "weab.se", "WEAB (W Entreprenad i Skåne AB)")).toBe(true);
  });
  it("matches names that differ only in spacing", () => {
    expect(m("LennartsBilel AB", "lennartsbilel.se", "Lennarts Bilel AB")).toBe(true);
    expect(m("Waxholmshotell", "waxholmshotell.se", "Waxholms Hotell")).toBe(true);
    expect(m("Visdomsboden - Mariastaden", "visdomsboden.se", "Visdomsboden AB")).toBe(true);
  });
  it("still rejects a different business, a short or missing domain and an unrelated name", () => {
    expect(m("Freshup", "freshup.se", "Fresh Fruit Stockholm")).toBe(false);
    expect(m("Bygg AB", "bygg.se", "Bygg Och Måleri Stockholm")).toBe(false); // domain label too short to count
    expect(m("Battericentralen", "battericentralen.se", "Batterilagret Borås")).toBe(false);
    expect(m("Frisör Anna", "", "Frisör Eva")).toBe(false);
  });
});

describe("domainLabel", () => {
  it("is the first part of the domain without the ending, and null when it is too short", () => {
    expect(domainLabel("www.freshup.se")).toBe("freshup");
    expect(domainLabel("Waxholms-Hotell.se")).toBe("waxholmshotell");
    expect(domainLabel("ab.se")).toBeNull();
    expect(domainLabel(null)).toBeNull();
  });
});

describe("looksLikeBusinessName", () => {
  it("accepts ordinary company names and rejects page titles, descriptions and single generic words", () => {
    expect(looksLikeBusinessName("Täby Bygg & Måleri AB")).toBe(true);
    expect(looksLikeBusinessName("Rörmokaren AB")).toBe(true);
    expect(looksLikeBusinessName("Estetisk klinik i Göteborg, leg. specialist")).toBe(false); // comma: a title
    expect(looksLikeBusinessName("Din charterflygplats från Norrköping")).toBe(false);
    expect(looksLikeBusinessName("Webbyrå med foto & filmproduktion i Borås")).toBe(false);
    expect(looksLikeBusinessName("Taxi")).toBe(false);
    expect(looksLikeBusinessName("Bygg AB")).toBe(false);
  });
});

describe("placesResembleCompany and the unsure outcome", () => {
  it("resembles when a result shares a distinctive word, not just a common trade word", () => {
    expect(placesResembleCompany([place("Next Level Employment AB")], "Next Level Electric AB")).toBe(true);
    expect(placesResembleCompany([place("Johanssons Bygg AB")], "Anderssons Bygg AB")).toBe(false);
    expect(placesResembleCompany([], "Rörmokaren AB")).toBe(false);
  });
  it("says none only for a real looking name that nothing resembles, otherwise unsure", () => {
    expect(classifyPlaces([place("Helt Annan Firma")], { name: "Rörmokaren AB" }).state).toBe("none");
    expect(classifyPlaces([place("Next Level Employment AB")], { name: "Next Level Electric AB" }).state).toBe("unsure");
    expect(classifyPlaces([], { name: "Din charterflygplats från Norrköping" }).state).toBe("unsure");
    expect(classifyPlaces([], { name: "Taxi" }).state).toBe("unsure");
  });
  it("matches a long single word that starts the Google name", () => {
    expect(placeNameMatches({ name: "FöretagsEkonomerna", domain: null }, "FöretagsEkonomerna - Redovisningskonsult Malmö")).toBe(true);
  });
});

describe("placeIsCompany (website or phone on the Google listing)", () => {
  const listed = (over: Partial<RawPlace>): RawPlace => ({ ...place("Rörmokare Värmdö"), ...over });
  it("is the company when the listing's website is the company's domain, whatever the name", () => {
    expect(placeIsCompany([listed({ websiteUri: "https://www.boxbergvvs.se/kontakt" })], { domain: "boxbergvvs.se" })?.by).toBe("website");
  });
  it("is the company when the phone numbers match", () => {
    expect(placeIsCompany([listed({ nationalPhoneNumber: "070-123 45 67" })], { phone: "0701234567" })?.by).toBe("phone");
  });
  it("is not the company for another website or phone, or a permanently closed listing", () => {
    expect(placeIsCompany([listed({ websiteUri: "https://annat.se" })], { domain: "boxbergvvs.se" })).toBeNull();
    expect(placeIsCompany([listed({ websiteUri: "https://boxbergvvs.se", businessStatus: "CLOSED_PERMANENTLY" })], { domain: "boxbergvvs.se" })).toBeNull();
  });
});

describe("checkCompany second look", () => {
  const none = async () => [] as RawPlace[];
  const hp = async () => null;
  it("rescues a company whose Google name is different, by website", async () => {
    const confirm = vi.fn(async () => [{ ...place("Rörmokare Värmdö"), websiteUri: "https://boxbergvvs.se" }]);
    const r = await checkCompany({ name: "Boxberg Vvs AB", domain: "boxbergvvs.se" }, { search: none, homepage: hp, confirm });
    expect(r).toMatchObject({ state: "has", via: "website", placeName: "Rörmokare Värmdö" });
  });
  it("stays none when the second look finds nothing that is the company, and is unsure when it could not run", async () => {
    expect((await checkCompany({ name: "Boxberg Vvs AB", domain: "boxbergvvs.se" }, { search: none, homepage: hp, confirm: async () => [place("Någon Annan")] }))?.state).toBe("none");
    expect((await checkCompany({ name: "Boxberg Vvs AB", domain: "boxbergvvs.se" }, { search: none, homepage: hp, confirm: async () => null }))?.state).toBe("unsure");
  });
  it("does not spend the second look on a company that already has a match, or without a domain or phone", async () => {
    const confirm = vi.fn(async () => []);
    await checkCompany({ name: "Täby Bygg AB", domain: "tabybygg.se" }, { search: async () => [place("Täby Bygg AB")], homepage: hp, confirm });
    await checkCompany({ name: "Boxberg Vvs AB" }, { search: none, homepage: hp, confirm });
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("names and numbers that are placeholders (real: the first pilot list)", () => {
  it("does not take a website builder's default title or the web address for a company name", () => {
    expect(looksLikeBusinessName("My Site")).toBe(false);
    expect(looksLikeBusinessName("Mysite")).toBe(false);
    expect(looksLikeBusinessName("My Vxw Site Uuq0wt")).toBe(false);
    expect(looksLikeBusinessName("hbb.se")).toBe(false);
    expect(looksLikeBusinessName("lifemusic", "lifemusic.se")).toBe(false); // lower case, one word, same as the domain
    expect(looksLikeBusinessName("Rörhjälpen", "rorhjalpen.se")).toBe(true); // a real name that happens to match its domain
  });
  it("calls such a company unsure and not without a profile", () => {
    expect(classifyPlaces([], { name: "My Vxw Site Y3mjrg", domain: "dvorobygg.se" }).state).toBe("unsure");
    expect(classifyPlaces([], { name: "hbb.se", domain: "hbb.se" }).state).toBe("unsure");
  });
  it("spots example phone numbers", () => {
    expect(isPlaceholderPhone("+46701234567")).toBe(true);
    expect(isPlaceholderPhone("070-123 45 67")).toBe(true);
    expect(isPlaceholderPhone("+46761337117")).toBe(false);
    expect(isPlaceholderPhone(null)).toBe(false);
  });
});
