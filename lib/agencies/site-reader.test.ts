import { describe, expect, it, vi } from "vitest";
import type { SafePage } from "@/lib/profile/safe-fetch";
import { customerDomainOf, guessDomains, logoNames, readAgencySite, type SiteReaderDeps } from "./site-reader";

const capace = { name: "Capace Media Group", domain: "capace.se" };

const HOME = `<html><body>
<a href="/kundcase/">Kundcase</a><a href="/tjanster/">Tjänster</a><a href="https://join.capace.se/">Karriär</a>
<img alt="Linnea&Basilika"><img alt="BestChampagne"><img alt="Salads and Smoothies"><img alt="Illustation på Malmö stads landmärken">
<img alt="Google Partner Badge för Capace Media"><img alt="tillväxt sigill"><img alt="Icon för Facebook"><img alt="fbpx"><img alt="Gröna växter och vita ballonger">
</body></html>`;
const KUNDCASE = `<html><body><a href="/brf24/">BRF24</a><a href="/jarhns/">Järhns</a><img alt="Rubinpool"><a href="https://www.facebook.com/capacemedia/">fb</a></body></html>`;
const CASE = (url: string) => `<html><body><a href="${url}">Besök sajten</a><a href="https://www.instagram.com/x">ig</a><a href="https://join.capace.se/">karriär</a></body></html>`;
const SITEMAP = `<urlset><url><loc>https://capace.se/kundcase/</loc></url><url><loc>https://capace.se/brf24/</loc></url><url><loc>https://capace.se/om-oss/</loc></url></urlset>`;

function pageOf(url: string, html: string | null): SafePage {
  return { url, finalUrl: url, status: html ? 200 : 404, html, headers: {}, problem: null } as SafePage;
}
function deps(map: Record<string, string>): SiteReaderDeps & { fetched: string[] } {
  const fetched: string[] = [];
  return { fetched, safeFetch: vi.fn(async (url: string) => { fetched.push(url); return pageOf(url, map[url] ?? null); }) as unknown as SiteReaderDeps["safeFetch"] };
}

describe("logoNames", () => {
  it("takes customer names from alt texts and leaves out descriptions of images and badges", () => {
    expect(logoNames(HOME)).toEqual(["Linnea&Basilika", "BestChampagne", "Salads and Smoothies"]);
  });
});

describe("guessDomains", () => {
  it("makes a few plausible domains for a name", () => {
    expect(guessDomains("Rubinpool")).toEqual(["rubinpool.se", "rubinpool.com"]);
    expect(guessDomains("Harald Nyborg")).toEqual(["haraldnyborg.se", "haraldnyborg.com", "harald-nyborg.se"]);
    expect(guessDomains("Åkeri & Bygg AB")).toEqual(["akeribygg.se", "akeribygg.com", "akeri-bygg.se"]);
    expect(guessDomains("AB")).toEqual([]);
  });
});

describe("customerDomainOf", () => {
  it("accepts a customer's site and rejects the agency's own, social media and tools", () => {
    expect(customerDomainOf("https://www.brf24.se/", capace)).toBe("brf24.se");
    expect(customerDomainOf("https://join.capace.se/", capace)).toBeNull();
    expect(customerDomainOf("https://www.facebook.com/capacemedia/", capace)).toBeNull();
    expect(customerDomainOf("https://gmpg.org/xfn/11", capace)).toBeNull();
  });
});

describe("readAgencySite", () => {
  const map = {
    "https://capace.se/": HOME,
    "https://capace.se/sitemap.xml": SITEMAP,
    "https://capace.se/kundcase/": KUNDCASE,
    "https://capace.se/brf24/": CASE("https://www.brf24.se/"),
    "https://capace.se/jarhns/": CASE("https://jarhns.se/"),
  };

  it("follows case pages to the customers' own links, and guesses domains for logo names", async () => {
    const r = await readAgencySite(capace, deps(map));
    const by = Object.fromEntries(r.findings.map((f) => [f.domain, f.how]));
    expect(by["brf24.se"]).toBe("case-link");
    expect(by["jarhns.se"]).toBe("case-link");
    expect(by["bestchampagne.se"]).toBe("name-guess");
    expect(by["rubinpool.se"]).toBe("name-guess");
    expect(Object.keys(by)).not.toContain("facebook.com");
    expect(r.findings.find((f) => f.domain === "brf24.se")?.sourceUrl).toBe("https://capace.se/brf24/");
  });
  it("does not guess a domain for a name that already has a real link", async () => {
    const r = await readAgencySite(capace, deps({ ...map, "https://capace.se/kundcase/": `${KUNDCASE}<img alt="BRF24">` }));
    expect(r.findings.filter((f) => f.domain.startsWith("brf24"))).toHaveLength(1);
  });
  it("gives nothing when the home page cannot be read, and fetches only the agency's own pages", async () => {
    expect(await readAgencySite(capace, deps({}))).toEqual({ findings: [], pages: 0 });
    const d = deps(map);
    await readAgencySite(capace, d);
    expect(d.fetched.every((u) => u.startsWith("https://capace.se/"))).toBe(true);
  });
});
