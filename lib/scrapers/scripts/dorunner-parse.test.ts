import { describe, expect, it } from "vitest";
import { parseProfile, parseProfileLinks, toItem } from "./dorunner-parse";

const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const ORG = ld({ "@type": "Organization", name: "Dorunner / Dorunner AB", contactPoint: { telephone: "+46 8 580 800 05" } });
const profile = (extra = "", biz: Record<string, unknown> | null = { "@type": "LocalBusiness", name: "3-Golv", aggregateRating: { ratingValue: "4.9", reviewCount: 15 } }) =>
  `<html><head><title>3-Golv - Hitta din expert </title>${ORG}${biz ? ld(biz) : ""}</head><body><a href="https://www.facebook.com/dorunner">f</a>${extra}</body></html>`;

describe("parseProfileLinks", () => {
  it("lists profile links once each and ignores everything else", () => {
    const html = `<a href="https://www.dorunner.se/f%C3%B6retag/3-golv-8736">a</a><a href="https://www.dorunner.se/f%C3%B6retag/3-golv-8736">dup</a>
      <a href="https://www.dorunner.se/f%C3%B6retag/amih-entreprenad-ab-9256">b</a><a href="https://www.dorunner.se/katalog?page=2">next</a>`;
    expect(parseProfileLinks(html).map((p) => p.id)).toEqual(["8736", "9256"]);
  });
  it("reads a sitemap and ignores the Livewire snapshot noise", () => {
    const xml = `<urlset><url><loc>https://www.dorunner.se/f%C3%B6retag/buskhaga-st%C3%A4d-ab-1797</loc></url></urlset><div wire:snapshot="{&quot;x&quot;:&quot;https://www.dorunner.se/företag/fel-1&quot;}"></div>`;
    expect(parseProfileLinks(xml)).toEqual([{ id: "1797", url: "https://www.dorunner.se/f%C3%B6retag/buskhaga-st%C3%A4d-ab-1797" }]);
  });
});

describe("parseProfile", () => {
  it("reads name and rating from the business block and the company's own site", () => {
    const p = parseProfile(profile(`<a href="http://www.3-golv.se/">Be om offert</a>`), "8736", "https://www.dorunner.se/företag/3-golv-8736");
    expect(p).toEqual({ id: "8736", url: "https://www.dorunner.se/företag/3-golv-8736", name: "3-Golv", domain: "3-golv.se", rating: 4.9, reviews: 15 });
  });
  it("skips Dorunner, social media and tag manager links when looking for the website", () => {
    const html = profile(`<a href="https://www.googletagmanager.com/x">g</a><a href="https://www.instagram.com/foo">i</a><a href="https://dorunner.se/om">d</a><a href="https://roranderor.se">r</a>`);
    expect(parseProfile(html, "1", "u")?.domain).toBe("roranderor.se");
  });
  it("has no domain when the company lists no website", () => {
    expect(parseProfile(profile(), "2", "u")?.domain).toBeNull();
  });
  it("falls back to the page title for the name, and has no rating without reviews", () => {
    const p = parseProfile(profile(`<a href="https://x.se">x</a>`, null), "3", "u")!;
    expect(p).toMatchObject({ name: "3-Golv", rating: null, reviews: null, domain: "x.se" });
  });
  it("returns null when there is no name at all", () => {
    expect(parseProfile("<html></html>", "4", "u")).toBeNull();
  });
});

describe("toItem", () => {
  it("keys a company with a website on its domain and queues it for a visit", () => {
    const i = toItem({ id: "8736", url: "u", name: "3-Golv", domain: "3-golv.se", rating: 4.9, reviews: 15 });
    expect(i).toMatchObject({ dedupeKey: "3-golv.se", domain: "3-golv.se", website: "https://3-golv.se", prefilled: false, companyName: "3-Golv" });
  });
  it("keys a company without a website on its Dorunner id and skips the visit", () => {
    expect(toItem({ id: "45647", url: "u", name: "X", domain: null, rating: null, reviews: null })).toMatchObject({ dedupeKey: "dorunner:45647", domain: null, website: null, prefilled: true });
  });
});
