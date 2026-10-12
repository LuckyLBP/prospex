import { describe, expect, it } from "vitest";
import { repairModelJson } from "./repair";

const parse = (s: string | null) => (s === null ? null : JSON.parse(s));

describe("repairModelJson", () => {
  it("leaves valid JSON alone", () => {
    expect(parse(repairModelJson('{"a":1,"b":[1,2]}'))).toEqual({ a: 1, b: [1, 2] });
  });
  it("removes a stray closing brace that ends the root object too early", () => {
    // Samma fel som DeepSeek gjorde: en klammer för mycket efter services-listan.
    const broken = '{"summary":"x","services":[{"name":"a"}]},"observations":[{"text":"t"}]}';
    expect(parse(repairModelJson(broken))).toEqual({ summary: "x", services: [{ name: "a" }], observations: [{ text: "t" }] });
  });
  it("handles more than one stray brace", () => {
    const broken = '{"a":{"b":1}},"c":{"d":2}},"e":3}';
    expect(parse(repairModelJson(broken))).toEqual({ a: { b: 1 }, c: { d: 2 }, e: 3 });
  });
  it("strips a code fence and text around the object", () => {
    expect(parse(repairModelJson('Här är svaret:\n```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    expect(parse(repairModelJson('{"a":1}\nHoppas det hjälper!'))).toEqual({ a: 1 });
  });
  it("removes trailing commas", () => {
    expect(parse(repairModelJson('{"a":[1,2,],"b":1,}'))).toEqual({ a: [1, 2], b: 1 });
  });
  it("gives up, with null, on things it cannot fix", () => {
    expect(repairModelJson("ingen json här")).toBeNull();
    expect(repairModelJson('{"a":')).toBeNull();
    expect(repairModelJson("")).toBeNull();
  });
  it("does not touch braces inside strings", () => {
    expect(parse(repairModelJson('{"a":"}x,{"}'))).toEqual({ a: "}x,{" });
  });
});

import { coerceModelOutput } from "./repair";
import { ProfileModelOutput } from "./types";

describe("coerceModelOutput", () => {
  const good = { talkingPoints: [] as unknown[], summary: "S", offering: [{ text: "T", evidence: ["F1"] }], audience: { text: "A", evidence: ["F2"] }, services: [{ name: "N", supplier: null, category: "e-post", basis: "B", confidence: "trolig", evidence: ["F3"] }], observations: [{ text: "O", evidence: ["F4"] }] };

  it("leaves a correct answer unchanged", () => {
    expect(coerceModelOutput(good)).toEqual(good);
  });
  it("takes the first item when the model wrote the audience as a list", () => {
    const r = coerceModelOutput({ ...good, audience: [{ text: "Villaägare", evidence: ["F1"] }, { text: "Andra", evidence: ["F2"] }] }) as { audience: unknown };
    expect(r.audience).toEqual({ text: "Villaägare", evidence: ["F1"] });
  });
  it("makes an audience of nothing, or of an empty list, null", () => {
    expect((coerceModelOutput({ ...good, audience: [] }) as { audience: unknown }).audience).toBeNull();
    expect((coerceModelOutput({ ...good, audience: undefined }) as { audience: unknown }).audience).toBeNull();
  });
  it("wraps a single evidence id in a list, and drops ids that are not fact ids", () => {
    const r = coerceModelOutput({ ...good, offering: [{ text: "T", evidence: "F7" }, { text: "U", evidence: ["F1", "P3", "x"] }, { text: "V", evidence: ["P1"] }] }) as { offering: unknown[] };
    expect(r.offering).toEqual([{ text: "T", evidence: ["F7"] }, { text: "U", evidence: ["F1"] }]);
  });
  it("drops claims with no text or no evidence instead of failing the whole answer", () => {
    const r = coerceModelOutput({ ...good, observations: [{ text: "", evidence: ["F1"] }, { text: "Utan belägg" }, { text: "Ok", evidence: ["F1"] }, "sträng", null] }) as { observations: unknown[] };
    expect(r.observations).toEqual([{ text: "Ok", evidence: ["F1"] }]);
  });
  it("treats missing lists as empty, and a missing summary as empty text", () => {
    expect(coerceModelOutput({})).toEqual({ summary: "", offering: [], audience: null, services: [], observations: [], talkingPoints: [] });
  });
  it("shortens text that is too long, at a word boundary, and caps list lengths", () => {
    const long = "ord ".repeat(300);
    const r = coerceModelOutput({ ...good, summary: long, offering: Array.from({ length: 12 }, () => ({ text: long, evidence: ["F1"] })) }) as { summary: string; offering: { text: string }[] };
    expect(r.summary.length).toBeLessThanOrEqual(700);
    expect(r.offering).toHaveLength(8);
    expect(r.offering[0].text.length).toBeLessThanOrEqual(400);
    expect(r.offering[0].text.endsWith("ord")).toBe(true);
  });
  it("cleans talking points like other claims, and caps them at five", () => {
    const r = coerceModelOutput({ ...good, talkingPoints: [...Array.from({ length: 8 }, (_, i) => ({ text: `Punkt ${i}`, evidence: "F1" })), { text: "Utan belägg" }] }) as { talkingPoints: { text: string; evidence: string[] }[] };
    expect(r.talkingPoints).toHaveLength(5);
    expect(r.talkingPoints[0]).toEqual({ text: "Punkt 0", evidence: ["F1"] });
  });
  it("never lets a service be stronger than probable, and maps unknown categories to other", () => {
    const r = coerceModelOutput({ ...good, services: [{ name: "A", category: "okänd", basis: "b", confidence: "stark", evidence: ["F1"] }, { name: "B", category: "chatt", basis: "b", confidence: "vet ej", evidence: ["F1"] }, { name: "C", evidence: [] }] }) as { services: { category: string; confidence: string }[] };
    expect(r.services.map((s) => [s.category, s.confidence])).toEqual([["övrigt", "trolig"], ["chatt", "svag"]]);
  });
  it("gives null for anything that is not an object", () => {
    for (const v of [null, "text", 5, [], undefined]) expect(coerceModelOutput(v)).toBeNull();
  });
  it("produces something the schema accepts, from the failure seen in practice", () => {
    const seen = { summary: "En verkstad.", offering: [{ text: "Service.", evidence: ["F7", "F8"] }], audience: [{ text: "Bilägare.", evidence: ["F7"] }], services: [], observations: [] };
    expect(ProfileModelOutput.safeParse(coerceModelOutput(seen)).success).toBe(true);
  });
});
