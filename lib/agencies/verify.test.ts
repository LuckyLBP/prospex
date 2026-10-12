import { describe, expect, it, vi } from "vitest";
import type { SafePage } from "@/lib/profile/safe-fetch";
import { verifyCandidate, type VerifyDeps } from "./verify";

const agency = { name: "Conseo Webb", domain: "conseo.se" };
const ok = (html: string): SafePage => ({ url: "https://kund.se", finalUrl: "https://kund.se/", status: 200, html, headers: {}, problem: null }) as SafePage;
const bad = (status: number, problem: string | null = null): SafePage => ({ url: "https://kund.se", finalUrl: "https://kund.se/", status, html: null, headers: {}, problem }) as SafePage;
const deps = (page: SafePage): VerifyDeps => ({ safeFetch: vi.fn(async () => page) as unknown as VerifyDeps["safeFetch"] });
const withFooter = (footer: string) => `<html><body><main>Välkommen</main><footer>${footer}</footer></body></html>`;

describe("verifyCandidate", () => {
  it("accepts a footer credit that names the agency", async () => {
    const v = await verifyCandidate("kund.se", agency, deps(ok(withFooter(`Hemsida skapad av <a href="https://conseo.se">Conseo Webb</a>`))));
    expect(v).toMatchObject({ accepted: true, confidence: "credit", evidenceUrl: "https://kund.se/" });
  });
  it("accepts a bare footer link as the weaker proof", async () => {
    const v = await verifyCandidate("kund.se", agency, deps(ok(withFooter(`<a href="https://conseo.se"><img src="l.png" alt=""></a>`))));
    expect(v).toMatchObject({ accepted: true, confidence: "footer-link" });
  });
  it("rejects a credit that names another agency, and a page with no credit", async () => {
    expect(await verifyCandidate("kund.se", agency, deps(ok(withFooter(`Skapad av <a href="https://infront.se">Infront Media</a>`))))).toEqual({ accepted: false, reason: "other-agency", to: "Infront Media" });
    expect(await verifyCandidate("kund.se", agency, deps(ok(withFooter("© Kund AB"))))).toEqual({ accepted: false, reason: "no-credit" });
  });
  it("rejects the agency's own sites without fetching", async () => {
    const d = deps(ok(withFooter("")));
    expect(await verifyCandidate("blogg.conseo.se", agency, d)).toEqual({ accepted: false, reason: "own-domain" });
    expect(d.safeFetch).not.toHaveBeenCalled();
  });
  it("tells a blocked site from one that does not answer", async () => {
    expect(await verifyCandidate("kund.se", agency, deps(bad(403)))).toEqual({ accepted: false, reason: "blocked" });
    expect(await verifyCandidate("kund.se", agency, deps(bad(500)))).toEqual({ accepted: false, reason: "unreachable" });
  });

  describe("portfolio proof", () => {
    const proof = (html: string | null, url = "https://conseo.se/kunder") => ({ url, html });
    const listing = `<ul><li><a href="https://kund.se/">Kund AB</a></li></ul>`;
    it("accepts a customer the agency's own page lists, when the customer's page credits nobody else", async () => {
      const v = await verifyCandidate("kund.se", agency, deps(ok(withFooter("© Kund AB"))), proof(listing));
      expect(v).toMatchObject({ accepted: true, confidence: "portfolio", evidenceUrl: "https://conseo.se/kunder" });
    });
    it("accepts it even when the customer's site blocks us, but not when it does not answer", async () => {
      expect(await verifyCandidate("kund.se", agency, deps(bad(403)), proof(listing))).toMatchObject({ accepted: true, confidence: "portfolio" });
      expect(await verifyCandidate("kund.se", agency, deps(bad(500)), proof(listing))).toEqual({ accepted: false, reason: "unreachable" });
    });
    it("rejects when the customer credits another agency, or the page does not mention the customer", async () => {
      expect(await verifyCandidate("kund.se", agency, deps(ok(withFooter(`Skapad av <a href="https://infront.se">Infront Media</a>`))), proof(listing))).toEqual({ accepted: false, reason: "other-agency", to: "Infront Media" });
      expect(await verifyCandidate("kund.se", agency, deps(ok(withFooter("© Kund AB"))), proof(`<p>Inga kunder här</p>`))).toEqual({ accepted: false, reason: "no-credit" });
    });
    it("never trusts a proof page outside the agency's own domain, or one that could not be fetched", async () => {
      expect(await verifyCandidate("kund.se", agency, deps(ok(withFooter("© Kund AB"))), proof(listing, "https://annan.se/kunder"))).toEqual({ accepted: false, reason: "no-credit" });
      expect(await verifyCandidate("kund.se", agency, deps(ok(withFooter("© Kund AB"))), proof(null))).toEqual({ accepted: false, reason: "no-credit" });
    });
  });

  describe("credits without a link, fingerprints and backlinks", () => {
    const capace = { name: "Capace Media Group", domain: "capace.se" };
    it("accepts a text-only credit (brf24-style), as the text-credit tier", async () => {
      const v = await verifyCandidate("brf24.se", capace, deps(ok(withFooter(`<p>Byggd med <span>♥</span> av Capace Media</p>`))));
      expect(v).toMatchObject({ accepted: true, confidence: "text-credit", evidence: expect.stringContaining("Capace Media") });
    });
    it("does not count the agency's name without a credit word before it", async () => {
      expect(await verifyCandidate("kund.se", capace, deps(ok(withFooter(`<p>Vi samarbetar med Capace Media om annonser.</p>`))))).toEqual({ accepted: false, reason: "no-credit" });
    });
    it("accepts a code fingerprint (jarhns-style): generator tag, theme folder or the agency's own resources", async () => {
      const generator = `<html><head><meta content="Capace Media AB v.1.0" name="generator"/></head><body><footer>© Järhns</footer></body></html>`;
      expect(await verifyCandidate("jarhns.se", capace, deps(ok(generator)))).toMatchObject({ accepted: true, confidence: "fingerprint", evidence: expect.stringContaining("Generator") });
      const theme = `<html><head><link rel="stylesheet" href="/wp-content/themes/capace-child/style.css"></head><body><footer>© X</footer></body></html>`;
      expect(await verifyCandidate("x.se", capace, deps(ok(theme)))).toMatchObject({ accepted: true, confidence: "fingerprint", evidence: "Tema: capace-child" });
      const own = `<html><head><script src="https://assets.capace.se/app.js"></script></head><body><footer>© X</footer></body></html>`;
      expect(await verifyCandidate("x.se", capace, deps(ok(own)))).toMatchObject({ accepted: true, confidence: "fingerprint" });
    });
    it("keeps a blocked site as a backlink when the link text is a clear credit, but not for a bare name", async () => {
      const blocked = deps(bad(403));
      const credit = { urlFrom: "https://kund.se/kontakt", anchor: "Byggd med ♥ av Capace Media | Webbyrå Malmö" };
      expect(await verifyCandidate("kund.se", capace, blocked, null, credit)).toMatchObject({ accepted: true, confidence: "backlink", evidenceUrl: "https://kund.se/kontakt" });
      expect(await verifyCandidate("kund.se", capace, deps(bad(403)), null, { urlFrom: "https://kund.se/", anchor: "Capace Media" })).toEqual({ accepted: false, reason: "blocked" });
      expect(await verifyCandidate("kund.se", capace, deps(bad(500)), null, credit)).toEqual({ accepted: false, reason: "unreachable" });
    });
    it("looks at the page the backlink came from when the home page shows nothing", async () => {
      const home = ok(withFooter("© Kund AB"));
      const inner = { ...ok(withFooter(`Hemsida skapad av <a href="https://capace.se">Capace Media</a>`)), finalUrl: "https://kund.se/om-oss" };
      const fetch = vi.fn(async (url: string) => (url.includes("om-oss") ? inner : home)) as unknown as VerifyDeps["safeFetch"];
      const v = await verifyCandidate("kund.se", capace, { safeFetch: fetch }, null, { urlFrom: "https://kund.se/om-oss", anchor: "Capace Media" });
      expect(v).toMatchObject({ accepted: true, confidence: "credit", evidenceUrl: "https://kund.se/om-oss" });
    });
    it("does not look further when the home page credits a different agency", async () => {
      const fetch = vi.fn(async () => ok(withFooter(`Skapad av <a href="https://infront.se">Infront Media</a>`))) as unknown as VerifyDeps["safeFetch"];
      const v = await verifyCandidate("kund.se", capace, { safeFetch: fetch }, null, { urlFrom: "https://kund.se/om-oss", anchor: "Capace Media" });
      expect(v).toEqual({ accepted: false, reason: "other-agency", to: "Infront Media" });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("retries and unreadable pages", () => {
    const capace = { name: "Capace Media Group", domain: "capace.se" };
    it("tries http and then www when https does not answer", async () => {
      const seen: string[] = [];
      const fetch = vi.fn(async (url: string) => { seen.push(url); return url.startsWith("https://www.") ? ok(withFooter(`Byggd med ♥ av Capace Media`)) : bad(0); }) as unknown as VerifyDeps["safeFetch"];
      expect(await verifyCandidate("kund.se", capace, { safeFetch: fetch })).toMatchObject({ accepted: true, confidence: "text-credit" });
      expect(seen).toEqual(["https://kund.se", "http://kund.se", "https://www.kund.se"]);
    });
    it("keeps a page that shows no text without JavaScript as a backlink when the link text is a clear credit", async () => {
      const empty = ok(`<html><head><script src="/app.js"></script></head><body><div id="root"></div></body></html>`);
      const credit = { urlFrom: "https://kund.se/", anchor: "Byggd med ♥ av Capace Media | Webbyrå Malmö" };
      expect(await verifyCandidate("kund.se", capace, deps(empty), null, credit)).toMatchObject({ accepted: true, confidence: "backlink", evidence: expect.stringContaining("JavaScript") });
      expect(await verifyCandidate("kund.se", capace, deps(empty), null, { urlFrom: "https://kund.se/", anchor: "Capace Media" })).toEqual({ accepted: false, reason: "no-credit" });
    });
  });
});

