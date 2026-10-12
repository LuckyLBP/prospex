import { describe, expect, it } from "vitest";
import { FactBook } from "./facts";

const audit = { version: 1 as const, https: true, mobile: false, cms: "WordPress", cmsVersion: "6.4.2", builder: "Elementor", theme: "hello", copyrightYear: 2023, credit: "Webbyrån AB", analytics: true, tagManager: false, metaPixel: false, booking: "Bokadirekt", metaDescription: true };

describe("FactBook", () => {
  it("numbers facts F1, F2, ... in the order they are added", () => {
    const b = new FactBook();
    expect(b.add({ kind: "registry", label: "Bolagsform", value: "Aktiebolag", source: "Bolagsverket" }).id).toBe("F1");
    expect(b.add({ kind: "page", label: "Startsida", value: "hämtad", source: "https://x.se" }).id).toBe("F2");
    expect(b.all().map((f) => f.id)).toEqual(["F1", "F2"]);
    expect([...b.ids()]).toEqual(["F1", "F2"]);
  });
  it("does not add the same fact twice, and hands back the first one", () => {
    const b = new FactBook();
    const first = b.add({ kind: "detector", label: "Meta-pixel", value: "finns på sidan", source: "https://x.se", detector: "meta" });
    const again = b.add({ kind: "detector", label: "Meta-pixel", value: "finns på sidan", source: "https://x.se", detector: "meta" });
    expect(again).toBe(first);
    expect(b.all()).toHaveLength(1);
  });
  it("turns detections into facts with the detector id and the matching snippet", () => {
    const b = new FactBook();
    const [f] = b.addDetections([{ id: "klarna", name: "Klarna", category: "betalning", match: "klarnacdn.net/kp" }], "https://x.se/kassa");
    expect(f).toMatchObject({ id: "F1", kind: "detector", label: "Klarna", detector: "klarna", match: "klarnacdn.net/kp", source: "https://x.se/kassa" });
  });
  it("turns the site audit into facts, skipping what is missing", () => {
    const b = new FactBook();
    b.addAudit(audit, "https://x.se");
    const byDetector = Object.fromEntries(b.all().map((f) => [f.detector, f.value]));
    expect(byDetector).toMatchObject({ "cms:wordpress": "WordPress 6.4.2", "builder:elementor": "Elementor", theme: "hello", credit: "Webbyrån AB", "booking:bokadirekt": "Bokadirekt", copyright: "2023", https: "ja", mobile: "nej" });
    const bare = new FactBook();
    bare.addAudit({ ...audit, cms: null, cmsVersion: null, builder: null, theme: null, credit: null, booking: null, copyrightYear: null }, "https://x.se");
    expect(bare.all().map((f) => f.detector)).toEqual(["https", "mobile"]);
  });
});
