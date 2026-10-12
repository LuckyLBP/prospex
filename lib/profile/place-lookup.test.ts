import { describe, expect, it, vi } from "vitest";
import { FactBook } from "./facts";
import { lookupPlace, placeCacheFresh, placeFacts, PLACE_MISS_TTL_MS, PLACE_TTL_MS, type PlaceLookupDeps } from "./place-lookup";
import type { PlaceHit } from "./places";

const hit = (over: Partial<PlaceHit> = {}): PlaceHit => ({ placeId: "p1", name: "Företaget AB", address: "Storgatan 1", domain: "foretaget.se", phone: null, mapsUrl: "https://maps.google.com/?cid=1", rating: 4.6, ratingCount: 123, hours: ["måndag: 08:00–17:00"], category: "Rörmokare", status: "OPERATIONAL", ...over });
const NOW = Date.parse("2026-10-12T10:00:00Z");

function deps(over: Partial<PlaceLookupDeps> = {}): PlaceLookupDeps {
  return { configured: () => true, find: vi.fn(async () => hit()), read: vi.fn(async () => ({ value: null, fetchedAt: null })), write: vi.fn(async () => {}), now: () => NOW, ...over };
}
const input = { companyId: "c1", name: "Företaget AB", city: "Malmö", domain: "foretaget.se", known: null };

describe("placeCacheFresh", () => {
  it("keeps a hit for 30 days and a miss for 7", () => {
    const at = (ms: number) => new Date(NOW - ms);
    expect(placeCacheFresh({ value: { hit: hit() }, fetchedAt: at(PLACE_TTL_MS - 1000) }, NOW)).toBe(true);
    expect(placeCacheFresh({ value: { hit: hit() }, fetchedAt: at(PLACE_TTL_MS + 1000) }, NOW)).toBe(false);
    expect(placeCacheFresh({ value: { hit: null }, fetchedAt: at(PLACE_MISS_TTL_MS - 1000) }, NOW)).toBe(true);
    expect(placeCacheFresh({ value: { hit: null }, fetchedAt: at(PLACE_MISS_TTL_MS + 1000) }, NOW)).toBe(false);
    expect(placeCacheFresh({ value: null, fetchedAt: null }, NOW)).toBe(false);
  });
});

describe("lookupPlace", () => {
  it("asks Google, with the site's domain, and saves the answer", async () => {
    const d = deps();
    expect(await lookupPlace(input, d)).toMatchObject({ rating: 4.6 });
    expect(d.find).toHaveBeenCalledWith("Företaget AB", "Malmö", undefined, "foretaget.se");
    expect(d.write).toHaveBeenCalledWith("c1", { hit: expect.objectContaining({ placeId: "p1" }) });
  });
  it("uses a fresh cached answer without calling Google", async () => {
    const d = deps({ read: vi.fn(async () => ({ value: { hit: hit({ rating: 3.9 }) }, fetchedAt: new Date(NOW - 1000) })) });
    expect(await lookupPlace(input, d)).toMatchObject({ rating: 3.9 });
    expect(d.find).not.toHaveBeenCalled();
  });
  it("reuses the hit resolve already made", async () => {
    const d = deps();
    expect(await lookupPlace({ ...input, known: hit({ rating: 4.1 }) }, d)).toMatchObject({ rating: 4.1 });
    expect(d.find).not.toHaveBeenCalled();
  });
  it("gives nothing when Places is off, nothing is known about the company, or Google fails", async () => {
    expect(await lookupPlace(input, deps({ configured: () => false }))).toBeNull();
    expect(await lookupPlace({ ...input, name: null, domain: null }, deps())).toBeNull();
    expect(await lookupPlace(input, deps({ find: vi.fn(async () => { throw new Error("nere"); }) }))).toBeNull();
  });
  it("still returns the answer when saving it fails", async () => {
    expect(await lookupPlace(input, deps({ write: vi.fn(async () => { throw new Error("db"); }) }))).toMatchObject({ rating: 4.6 });
  });
});

describe("placeFacts", () => {
  it("writes rating, category and hours as facts, and skips what is missing", () => {
    const b = new FactBook();
    placeFacts(b, hit());
    const by = Object.fromEntries(b.all().map((f) => [f.label, f.value]));
    expect(by["Betyg på Google"]).toBe("4,6 av 5 från 123 omdömen");
    expect(by["Kategori på Google"]).toBe("Rörmokare");
    expect(by["Öppettider på Google"]).toContain("08:00");
    const none = new FactBook();
    placeFacts(none, hit({ rating: null, ratingCount: null, hours: [], category: null }));
    placeFacts(none, null);
    expect(none.all()).toEqual([]);
  });
  it("notes a temporarily closed business", () => {
    const b = new FactBook();
    placeFacts(b, hit({ status: "CLOSED_TEMPORARILY", rating: null, hours: [], category: null }));
    expect(b.all().map((f) => f.value)).toEqual(["Tillfälligt stängt"]);
  });
});
