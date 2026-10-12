import { describe, expect, it } from "vitest";
import { techCount, techGroups } from "./tech-view";
import type { CompanyProfile, Detection, Fact } from "./types";

const det = (id: string, name: string, category: Detection["category"], detail?: string): Detection => ({ id, name, category, detail });
const profile = (over: { audit?: Partial<NonNullable<CompanyProfile["website"]["audit"]>> | null; tech?: Detection[]; marketing?: Detection[]; facts?: Fact[] } = {}): Pick<CompanyProfile, "website" | "marketing" | "facts"> => ({
  website: { status: "ok", message: null, domain: "x.se", url: "https://x.se", tech: over.tech ?? [], audit: over.audit === null ? null : ({ version: 1, https: true, mobile: true, cms: null, cmsVersion: null, builder: null, theme: null, copyrightYear: null, credit: null, analytics: false, tagManager: false, metaPixel: false, booking: null, metaDescription: true, ...over.audit } as never) },
  marketing: { tech: over.marketing ?? [], social: [] },
  facts: over.facts ?? [],
});

describe("techGroups", () => {
  it("puts the platform first, with its version, then other groups in a fixed order", () => {
    const g = techGroups(profile({ audit: { cms: "WordPress", cmsVersion: "7.1.3", builder: "Elementor" }, tech: [det("klarna", "Klarna", "betalning"), det("woocommerce", "WooCommerce", "e-handel")], marketing: [det("meta", "Meta-pixel", "annonsering"), det("ga4", "Google Analytics 4", "analys")] }));
    expect(g.map((x) => x.title)).toEqual(["Plattform", "E-handel", "Betalning", "Annonsering", "Analys"]);
    expect(g[0].tiles).toEqual([{ id: null, name: "WordPress", detail: "7.1.3" }, { id: null, name: "Elementor", detail: null }]);
  });
  it("turns DNS facts into e-mail, domain and verification tiles, and hides the placeholder value", () => {
    const facts: Fact[] = [
      { id: "F1", kind: "dns", label: "Microsoft 365", value: "e-postserver", source: "DNS", detector: "mail-microsoft" },
      { id: "F2", kind: "dns", label: "Cloudflare", value: "namnserver", source: "DNS", detector: "ns-cloudflare" },
      { id: "F3", kind: "dns", label: "Meta Business", value: "finns på sidan", source: "DNS", detector: "txt-meta-verify" },
      { id: "F4", kind: "detector", label: "Ska inte med", value: "x", source: "x", detector: "meta" },
    ];
    const g = techGroups(profile({ facts }));
    expect(g.map((x) => [x.title, x.tiles.map((t) => [t.name, t.detail])])).toEqual([["E-post", [["Microsoft 365", "e-postserver"]]], ["Domän", [["Cloudflare", "namnserver"]]], ["Verifiering", [["Meta Business", null]]]]);
  });
  it("lists a thing once even when two sources report it", () => {
    const g = techGroups(profile({ audit: { booking: "Bokadirekt" }, tech: [det("x", "Bokadirekt", "bokning")] }));
    expect(techCount(g)).toBe(1);
  });
  it("is empty for a site with nothing, and without an audit", () => {
    expect(techGroups(profile())).toEqual([]);
    expect(techGroups(profile({ audit: null }))).toEqual([]);
    expect(techCount([])).toBe(0);
  });
  it("sorts an unknown category last instead of failing", () => {
    const g = techGroups(profile({ tech: [det("a", "A", "okänd" as never), det("b", "B", "analys")] }));
    expect(g.map((x) => x.title)).toEqual(["Analys", "okänd"]);
  });
  it("never uses a dash in the titles", () => {
    const g = techGroups(profile({ tech: (["analys", "annonsering", "e-handel", "e-post", "säljverktyg"] as const).map((c) => det(c, c, c)) }));
    expect(JSON.stringify(g)).not.toMatch(/[–—]/);
  });
});
