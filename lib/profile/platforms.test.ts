import { describe, expect, it } from "vitest";
import { KNOWN_PLATFORMS, knownPlatformLinks } from "./platforms";

const a = (...hrefs: string[]) => hrefs.map((h) => `<a href="${h}">x</a>`).join("");

describe("knownPlatformLinks", () => {
  it("finds known platforms once each, in the order they appear", () => {
    const r = knownPlatformLinks(a("https://www.bokadirekt.se/places/salong-1", "https://brabyggare.se/hantverkare/12/", "https://www.bokadirekt.se/places/annan"), "foretag.se");
    expect(r.map((p) => [p.name, p.kind])).toEqual([["Bokadirekt", "Bokning"], ["BraByggare", "Tjänsteplattform"]]);
    expect(r[0].url).toBe("https://www.bokadirekt.se/places/salong-1");
  });
  it("matches subdomains, and not a domain that only ends the same way", () => {
    expect(knownPlatformLinks(a("https://min.timma.se/x"), "foretag.se").map((p) => p.name)).toEqual(["Timma"]);
    expect(knownPlatformLinks(a("https://notbokadirekt.se/", "https://bokadirekt.se.evil.com/"), "foretag.se")).toEqual([]);
  });
  it("ignores links to the site itself, other schemes and unknown domains", () => {
    expect(knownPlatformLinks(a("https://shop.foretag.se/", "mailto:a@eniro.se", "javascript:void(0)", "https://example.org/"), "foretag.se")).toEqual([]);
    expect(knownPlatformLinks(a("https://eniro.se/x"), "eniro.se")).toEqual([]);
  });
  it("handles protocol-relative and entity-encoded links", () => {
    expect(knownPlatformLinks(a("//www.hitta.se/foretag?a=1&amp;b=2"), "foretag.se")[0]).toMatchObject({ name: "Hitta.se", url: "https://www.hitta.se/foretag?a=1&b=2" });
  });
  it("only lists platforms with a name and a kind, and no dashes in the labels", () => {
    for (const p of KNOWN_PLATFORMS) {
      expect(p.name.length).toBeGreaterThan(1);
      expect(`${p.name}${p.kind}`).not.toMatch(/[–—]/);
    }
    expect(new Set(KNOWN_PLATFORMS.map((p) => p.domain)).size).toBe(KNOWN_PLATFORMS.length);
  });
});
