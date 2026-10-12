import { describe, expect, it } from "vitest";
import { parseLines, parsePlacesConfig, toForm } from "./lists-config";

describe("parseLines", () => {
  it("trims, drops empties and duplicates, and keeps order", () => {
    expect(parseLines("  redovisningsbyrå \r\n\r\nrevisor\nredovisningsbyrå\n  bokföringsbyrå  ")).toEqual(["redovisningsbyrå", "revisor", "bokföringsbyrå"]);
  });
  it("collapses inner whitespace", () => {
    expect(parseLines("Stockholm   city")).toEqual(["Stockholm city"]);
  });
});

describe("parsePlacesConfig", () => {
  it("normalises and counts the requests a run would cost", () => {
    const r = parsePlacesConfig({ queries: "a\nb\nc", locations: "x\ny", maxPages: "3" });
    expect(r).toEqual({ ok: true, config: { queries: "a\nb\nc", locations: "x\ny", maxPages: 3 }, requests: 18 });
  });
  it("the classic list is about 225 requests", () => {
    const loc = Array.from({ length: 25 }, (_, i) => `Ort ${i}`).join("\n");
    const r = parsePlacesConfig({ queries: "a\nb\nc", locations: loc, maxPages: 3 });
    expect(r.ok && r.requests).toBe(225);
  });
  it("rejects empty queries or locations", () => {
    expect(parsePlacesConfig({ queries: " \n", locations: "x", maxPages: 1 })).toEqual({ ok: false, error: "Ange minst en sökterm." });
    expect(parsePlacesConfig({ queries: "a", locations: "", maxPages: 1 })).toEqual({ ok: false, error: "Ange minst en ort." });
  });
  it("rejects too many items and bad page counts", () => {
    expect(parsePlacesConfig({ queries: Array.from({ length: 11 }, (_, i) => `q${i}`).join("\n"), locations: "x", maxPages: 1 }).ok).toBe(false);
    expect(parsePlacesConfig({ queries: "a", locations: Array.from({ length: 61 }, (_, i) => `o${i}`).join("\n"), maxPages: 1 }).ok).toBe(false);
    expect(parsePlacesConfig({ queries: "a", locations: "x", maxPages: 0 }).ok).toBe(false);
    expect(parsePlacesConfig({ queries: "a", locations: "x", maxPages: 4 }).ok).toBe(false);
    expect(parsePlacesConfig({ queries: "a", locations: "x", maxPages: "abc" }).ok).toBe(false);
  });
});

describe("toForm", () => {
  it("reads what the old portal stored, with Windows line breaks", () => {
    expect(toForm({ queries: "a\r\nb", locations: "x", maxPages: 2 })).toEqual({ queries: "a\nb", locations: "x", maxPages: 2 });
  });
  it("is safe on anything else", () => {
    expect(toForm(null)).toEqual({ queries: "", locations: "", maxPages: 3 });
    expect(toForm({ script: "eniro-table-sync" })).toEqual({ queries: "", locations: "", maxPages: 3 });
  });
});
