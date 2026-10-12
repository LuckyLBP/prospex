import { describe, expect, it } from "vitest";
import { parseProfile, parseSitemapSlugs, toItem } from "./boka-parse";

const page = (inner: string, social = `<div class="d-flex gap-4 social-media-icons"><a href="https://www.facebook.com/x">f</a><a href="http://MY Studio">w</a></div>`) =>
  `<html><body><a href="https://boka.se/om">x</a><section class="grid-sidebar basic-info-container grid">${inner}${social}</section><section><a href="https://example.org/other">o</a></section></body></html>`;
const ZUMBA = `<h1 class="heading-2">Zumba4u</h1><div class="grid"><a href="tel:&#x2B;46739837760">&#x2B;46739837760</a><a href="http://www.zumba4u.se" target="_blank">www.zumba4u.se</a><a href="https://boka.se/zumba4u/om#kontakt">Kontakta oss</a></div>`;

describe("parseSitemapSlugs", () => {
  it("lists booking pages once each and skips deeper paths", () => {
    const xml = `<urlset><url><loc>https://boka.se/zumba4u</loc></url><url><loc>https://boka.se/str%C3%A4del%C3%A4ngan</loc></url><url><loc>https://boka.se/zumba4u</loc></url><url><loc>https://boka.se/event/talja/abc</loc></url></urlset>`;
    expect(parseSitemapSlugs(xml)).toEqual([
      { slug: "zumba4u", url: "https://boka.se/zumba4u" },
      { slug: "str%C3%A4del%C3%A4ngan", url: "https://boka.se/str%C3%A4del%C3%A4ngan" },
    ]);
  });
});

describe("parseProfile", () => {
  it("reads name, phone and the company's own website", () => {
    expect(parseProfile(page(ZUMBA), "zumba4u")).toEqual({ slug: "zumba4u", url: "https://boka.se/zumba4u", name: "Zumba4u", phone: "+46739837760", email: null, address: null, domain: "zumba4u.se" });
  });
  it("reads the address from the maps link, and works without a website", () => {
    const html = page(`<h1>Make it Yours Studio</h1><div><a href="https://www.google.com/maps/search/?api=1&amp;query=x" aria-label="Google maps - Bronsgatan19a , Oskarstr&#xF6;m">Bronsgatan</a><a href="tel:&#x2B;46732003401">x</a></div>`);
    expect(parseProfile(html, "yoursstudio")).toMatchObject({ name: "Make it Yours Studio", address: "Bronsgatan19a , Oskarström", domain: null, phone: "+46732003401" });
  });
  it("ignores the social media block, where companies often type junk instead of an address", () => {
    expect(parseProfile(page(`<h1>Ludvikark</h1>`), "ludvikark")?.domain).toBeNull();
  });
  it("has no phone when the page has none, and no website that is only a Boka link", () => {
    expect(parseProfile(page(`<h1>X</h1><a href="https://boka.se/x/om#kontakt">k</a>`), "x")).toMatchObject({ phone: null, domain: null });
  });
  it("reads an email when there is one", () => {
    expect(parseProfile(page(`<h1>X</h1><a href="mailto:Info@X.se">m</a>`), "x")?.email).toBe("info@x.se");
  });
  it("returns null for a page without the info box or a name", () => {
    expect(parseProfile("<html><h1>404</h1></html>", "x")).toBeNull();
    expect(parseProfile(page(`<h1> </h1>`), "x")).toBeNull();
  });
});

describe("toItem", () => {
  const base = { slug: "str%C3%A4del%C3%A4ngan", url: "u", name: "Strädelängan", phone: "+46700000001", email: null, address: null, domain: null as string | null };
  it("keys a company with a website on its domain and queues it for a visit", () => {
    expect(toItem({ ...base, domain: "zumba4u.se" })).toMatchObject({ dedupeKey: "zumba4u.se", website: "https://zumba4u.se", prefilled: false });
  });
  it("without a website, reuses a company we already have on the same phone, else the Boka name", () => {
    expect(toItem(base, new Map([["+46700000001", "rid.se"]])).dedupeKey).toBe("rid.se");
    expect(toItem(base).dedupeKey).toBe("boka:strädelängan");
    expect(toItem(base)).toMatchObject({ domain: null, prefilled: true });
  });
});
