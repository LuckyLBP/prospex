import { describe, expect, it, vi } from "vitest";
import { cityOf, mergeCandidates, searchCompanies, type NameSearchDeps } from "./name-search";
import type { PlaceHit } from "./places";

const place = (over: Partial<PlaceHit> = {}): PlaceHit => ({ placeId: "p", name: "Gullbergs Lyft", address: "Storgatan 1, 473 31 Henån, Sverige", domain: "gullbergslyft.se", phone: null, mapsUrl: null, rating: 4.8, ratingCount: 10, ...over });
const row = (over: Record<string, string | null> = {}) => ({ name: "Gullbergs Lyft & Entreprenad AB", orgnr: "556734-4535", domain: "gullbergslyft.se", city: "HENÅN", ...over });

describe("cityOf", () => {
  it("takes the town out of a Google address", () => {
    expect(cityOf("Storgatan 1, 473 31 Henån, Sverige")).toBe("Henån");
    expect(cityOf("Storgatan 1, Malmö")).toBe("Malmö");
    expect(cityOf(null)).toBeNull();
  });
});

describe("mergeCandidates", () => {
  it("puts the catalogue first and drops a Google hit for the same domain", () => {
    const r = mergeCandidates([row()], [place(), place({ name: "Annan", domain: "annan.se", address: null })]);
    expect(r.map((c) => [c.name, c.source])).toEqual([["Gullbergs Lyft & Entreprenad AB", "katalog"], ["Annan", "google"]]);
  });
  it("builds from the web address, else the org.nr, else nothing", () => {
    const [a, b, c] = mergeCandidates([row({ domain: null }), row({ name: "X", orgnr: null, domain: "x.se" })], [place({ name: "Y", domain: null, address: null })]);
    expect(a.buildFrom).toBe("556734-4535");
    expect(b.buildFrom).toBe("x.se");
    expect(c.buildFrom).toBeNull();
  });
  it("caps the list and skips catalogue rows without a name", () => {
    const many = Array.from({ length: 9 }, (_, i) => place({ name: `F${i}`, domain: `f${i}.se` }));
    expect(mergeCandidates([row({ name: null })], many)).toHaveLength(5);
  });
});

describe("searchCompanies", () => {
  const deps = (over: Partial<NameSearchDeps> = {}): NameSearchDeps => ({ catalog: vi.fn(async () => [row()]), places: vi.fn(async () => [place({ domain: "annat.se", name: "Annat" })]), placesConfigured: () => true, ...over });
  it("asks both sources and merges", async () => {
    expect((await searchCompanies("Gullbergs", deps())).map((c) => c.source)).toEqual(["katalog", "google"]);
  });
  it("ignores too short queries, and a source that fails or is off", async () => {
    const d = deps();
    expect(await searchCompanies("ab", d)).toEqual([]);
    expect(d.catalog).not.toHaveBeenCalled();
    expect((await searchCompanies("Gullbergs", deps({ places: vi.fn(async () => { throw new Error("nere"); }) }))).map((c) => c.source)).toEqual(["katalog"]);
    expect((await searchCompanies("Gullbergs", deps({ placesConfigured: () => false }))).map((c) => c.source)).toEqual(["katalog"]);
  });
});
