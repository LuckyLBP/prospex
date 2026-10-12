import { describe, expect, it } from "vitest";
import { resolveCreator, sameAgency } from "./creator-view";
import type { Fact, ProfileCreator } from "./types";

const fact = (id: string, detector: string, value: string): Fact => ({ id, kind: "audit", label: detector, value, source: "x", detector });
const creator = (over: Partial<ProfileCreator> = {}): ProfileCreator => ({ name: "Beegleton", url: "https://beegleton.com", domain: "beegleton.com", logoPath: null, supplierSlug: null, ...over });

describe("resolveCreator", () => {
  it("attaches the credit fact as evidence only when it is about the same agency", () => {
    expect(resolveCreator({ creator: creator(), facts: [fact("F1", "credit", "Beegleton")] })?.evidence).toEqual(["F1"]);
    expect(resolveCreator({ creator: creator({ name: "Snowfire" }), facts: [fact("F1", "credit", "Beegleton")] })?.evidence).toEqual([]);
  });
  it("uses the credit fact when the profile has no creator, and nothing when there is neither", () => {
    expect(resolveCreator({ creator: null, facts: [fact("F1", "credit", "Beegleton")] })).toMatchObject({ name: "Beegleton", evidence: ["F1"] });
    expect(resolveCreator({ creator: null, facts: [] })).toBeNull();
  });
  it("points the evidence at the 'Finns hos' fact when the agency comes from one of our sources", () => {
    const facts = [fact("F4", "credit", "Något annat"), fact("F17", "presence:tundran", "källa i vår katalog")];
    const r = resolveCreator({ creator: creator({ name: "Tundran Webbyrå", supplierSlug: "tundran", basis: "same-server" }), facts });
    expect(r).toMatchObject({ name: "Tundran Webbyrå", basis: "same-server", evidence: ["F17"] });
    expect(resolveCreator({ creator: creator({ supplierSlug: "tundran", basis: "agency-source" }), facts: [] })?.evidence).toEqual([]);
  });
});

describe("sameAgency", () => {
  it("matches on core name or slug", () => {
    expect(sameAgency("Conseo Webb", { name: "Conseo", slug: "conseo" })).toBe(true);
    expect(sameAgency("Tundran Webbyrå", { name: "Tundran Webbyrå", slug: "tundran" })).toBe(true);
    expect(sameAgency("Infront Media", { name: "Conseo", slug: "conseo" })).toBe(false);
  });
});
