import { describe, expect, it } from "vitest";
import { servicesFromFacts } from "./services";
import type { Fact } from "./types";

let n = 0;
const fact = (detector: string, value = "finns på sidan", kind: Fact["kind"] = "detector"): Fact => ({ id: `F${++n}`, kind, label: detector, value, source: "https://x.se", detector });

describe("servicesFromFacts", () => {
  it("treats a site builder platform as a strong service", () => {
    expect(servicesFromFacts([fact("cms:wix", "Wix", "audit")])).toEqual([
      { name: "Wix", supplier: "Wix", category: "webbplats", basis: "Webbplatsen är byggd på plattformen.", confidence: "stark", evidence: [expect.stringMatching(/^F\d+$/)], origin: "regel" },
    ]);
  });
  it("does not call WordPress or other free platforms a bought service", () => {
    expect(servicesFromFacts([fact("cms:wordpress", "WordPress 6.4", "audit"), fact("builder:elementor", "Elementor", "audit")])).toEqual([]);
  });
  it("makes the agency credit a probable service named after the agency", () => {
    const [s] = servicesFromFacts([fact("credit", "Webbyrån AB", "audit")]);
    expect(s).toMatchObject({ name: "Webbplats av Webbyrån AB", supplier: "Webbyrån AB", category: "webbplats", confidence: "trolig" });
  });
  it("treats advertising tags as probable, with careful wording", () => {
    const [s] = servicesFromFacts([fact("meta")]);
    expect(s).toMatchObject({ category: "annonsering", confidence: "trolig", supplier: "Meta" });
    expect(s.basis).toContain("kan annonsera");
  });
  it("treats mail, shop, payment and chat tools as strong", () => {
    const r = servicesFromFacts([fact("mailchimp"), fact("woocommerce"), fact("klarna"), fact("tidio"), fact("mail-microsoft")]);
    expect(r.map((s) => [s.name, s.category, s.confidence])).toEqual([
      ["Mailchimp", "e-post", "stark"], ["WooCommerce", "e-handel", "stark"], ["Klarna", "betalning", "stark"], ["Tidio", "chatt", "stark"], ["Microsoft 365", "e-post", "stark"],
    ]);
  });
  it("reads the booking system name from the audit fact", () => {
    expect(servicesFromFacts([fact("booking:bokadirekt", "Bokadirekt", "audit")])[0]).toMatchObject({ name: "Bokadirekt", category: "bokning", confidence: "stark" });
  });
  it("ignores free analytics, frameworks and anything without a rule", () => {
    expect(servicesFromFacts([fact("ga4"), fact("gtm"), fact("nextjs"), fact("recaptcha"), fact("https", "ja", "audit"), fact("theme", "hello", "audit")])).toEqual([]);
  });
  it("lists one service once and collects every piece of evidence for it", () => {
    const a = fact("mailchimp");
    const b = fact("spf-mailchimp", "får skicka e-post för domänen", "dns");
    const r = servicesFromFacts([a, b]);
    expect(r).toHaveLength(1);
    expect(r[0].evidence).toEqual([a.id, b.id]);
  });
  it("never names a confidence the rules do not give, and always ties a service to a fact", () => {
    const r = servicesFromFacts([fact("meta"), fact("klarna"), fact("cloudflare")]);
    for (const s of r) {
      expect(["stark", "trolig", "svag"]).toContain(s.confidence);
      expect(s.evidence.length).toBeGreaterThan(0);
      expect(s.origin).toBe("regel");
    }
  });
  it("uses no dashes in the wording", () => {
    const all = servicesFromFacts(["meta", "gads", "mailchimp", "woocommerce", "klarna", "cookiebot", "cloudflare", "mail-google", "spf-ses"].map((d) => fact(d)));
    expect(JSON.stringify(all)).not.toMatch(/[–—]/);
  });
});
