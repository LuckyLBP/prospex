import { describe, expect, it } from "vitest";
import { parseProfile, parseSitemapProfiles, toItem } from "./servicefinder-parse";

const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`;
const biz = (over: Record<string, unknown> = {}) => ({
  "@context": "https://schema.org", "@type": "LocalBusiness", name: "Börje Noreliusson Aktiebolag", telephone: "+46705229655", taxID: "5565038212",
  aggregateRating: { "@type": "AggregateRating", ratingValue: "5", reviewCount: 10 }, areaServed: [{ "@type": "AdministrativeArea", name: "Kil" }, { name: "Eda" }], ...over,
});

describe("parseProfile", () => {
  it("reads name, phone, org.nr, rating and areas", () => {
    expect(parseProfile(page(biz()), "6530844")).toEqual({
      id: "6530844", url: "https://servicefinder.se/foretag/6530844", name: "Börje Noreliusson Aktiebolag", phone: "+46705229655",
      orgnr: "556503-8212", reviews: 10, rating: 5, areas: ["Kil", "Eda"],
    });
  });
  it("leaves org.nr empty for a sole trader whose personal number is masked", () => {
    expect(parseProfile(page(biz({ taxID: "670406****" })), "1")?.orgnr).toBeNull();
  });
  it("rejects an org.nr that fails the checksum", () => {
    expect(parseProfile(page(biz({ taxID: "5565038213" })), "1")?.orgnr).toBeNull();
  });
  it("copes with a missing rating, phone or areas", () => {
    const p = parseProfile(page({ "@type": "LocalBusiness", name: "X AB" }), "2")!;
    expect(p).toMatchObject({ name: "X AB", phone: null, orgnr: null, reviews: null, rating: null, areas: [] });
  });
  it("returns null for a page without a LocalBusiness block, or with broken JSON", () => {
    expect(parseProfile("<html><title>404</title></html>", "3")).toBeNull();
    expect(parseProfile(`<script type="application/ld+json">{nope</script>`, "3")).toBeNull();
    expect(parseProfile(page({ "@type": "Organization", name: "Servicefinder" }), "3")).toBeNull();
  });
  it("finds the business block among other ld+json blocks", () => {
    const html = page({ "@type": "BreadcrumbList" }) + page(biz());
    expect(parseProfile(html, "4")?.name).toBe("Börje Noreliusson Aktiebolag");
  });
});

describe("parseSitemapProfiles", () => {
  it("lists profile ids once each, in order", () => {
    const xml = `<urlset><url><loc>https://servicefinder.se/foretag/6530844</loc></url><url><loc>https://servicefinder.se/foretag/6714661</loc></url><url><loc>https://servicefinder.se/foretag/6530844</loc></url><url><loc>https://servicefinder.se/om-oss</loc></url></urlset>`;
    expect(parseSitemapProfiles(xml)).toEqual([
      { id: "6530844", url: "https://servicefinder.se/foretag/6530844" },
      { id: "6714661", url: "https://servicefinder.se/foretag/6714661" },
    ]);
  });
});

describe("toItem", () => {
  const p = parseProfile(page(biz()), "6530844")!;
  const none = { byOrg: new Map<string, string>(), byPhone: new Map<string, string>() };
  it("makes a new company keyed on the Servicefinder id", () => {
    expect(toItem(p, none)).toMatchObject({ dedupeKey: "servicefinder:6530844", domain: null, companyName: "Börje Noreliusson Aktiebolag", phone: "+46705229655", orgnr: "556503-8212", prefilled: true, sourceUrl: p.url });
  });
  it("reuses the key of a company we already have with the same org.nr", () => {
    expect(toItem(p, { ...none, byOrg: new Map([["556503-8212", "borje.se"]]) }).dedupeKey).toBe("borje.se");
  });
  it("matches a sole trader on phone, but never a company with an org.nr on phone alone", () => {
    const sole = parseProfile(page(biz({ taxID: "670406****" })), "9")!;
    const phones = new Map([["+46705229655", "ewes.se"]]);
    expect(toItem(sole, { ...none, byPhone: phones }).dedupeKey).toBe("ewes.se");
    expect(toItem(p, { ...none, byPhone: phones }).dedupeKey).toBe("servicefinder:6530844");
  });
});
