import { describe, expect, it, vi } from "vitest";
import { isAgencySite, searchOwnCustomers, type SelfClassifyDeps, type SelfSearchDeps } from "./self";

const classify = (over: Partial<SelfClassifyDeps> = {}): SelfClassifyDeps => ({
  read: vi.fn(async () => null),
  save: vi.fn(async () => {}),
  describe: vi.fn(async () => "Titel: Webbyrå i Borås"),
  ai: vi.fn(async () => ({ kind: "agency" as const, confidence: "high" as const, reason: "Bygger webbplatser." })),
  ...over,
});

describe("isAgencySite", () => {
  it("asks once and remembers a confident answer", async () => {
    const d = classify();
    expect(await isAgencySite("byran.se", "Byrån", d)).toBe(true);
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ domain: "byran.se", kind: "agency", source: "ai" }));
  });
  it("lets a saved verdict, for example an admin correction, decide without asking", async () => {
    const d = classify({ read: vi.fn(async () => ({ kind: "platform" as const, source: "admin" as const, reason: null })) });
    expect(await isAgencySite("byran.se", "Byrån", d)).toBe(false);
    expect(d.ai).not.toHaveBeenCalled();
  });
  it("starts nothing on an unsure or missing answer, or an unreadable site", async () => {
    const unsure = classify({ ai: vi.fn(async () => ({ kind: "agency" as const, confidence: "low" as const, reason: "?" })) });
    expect(await isAgencySite("byran.se", "Byrån", unsure)).toBe(false);
    expect(unsure.save).not.toHaveBeenCalled();
    expect(await isAgencySite("byran.se", "Byrån", classify({ ai: vi.fn(async () => null) }))).toBe(false);
    expect(await isAgencySite("byran.se", "Byrån", classify({ describe: vi.fn(async () => null) }))).toBe(false);
  });
});

const found = { domain: "byran.se", name: "Byrån AB", orgId: "org1", userId: "u1", profileId: "p1" };
const search = (over: Partial<SelfSearchDeps> = {}): SelfSearchDeps => ({
  enabled: () => true,
  find: vi.fn(async () => found),
  isAgency: vi.fn(async () => true),
  request: vi.fn(async () => ({ state: "searching" as const })),
  ...over,
});

describe("searchOwnCustomers", () => {
  it("requests the list as an automatic request for the one who scouted", async () => {
    const d = search();
    expect(await searchOwnCustomers("p1", undefined, d)).toEqual({ state: "searching" });
    expect(d.request).toHaveBeenCalledWith({ domain: "byran.se", name: "Byrån AB", orgId: "org1", userId: "u1", profileId: "p1", auto: true });
  });
  it("credits the person scouting now when a finished profile is reused", async () => {
    const d = search();
    await searchOwnCustomers("p1", { userId: "u2", orgId: "org2" }, d);
    expect(d.request).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", orgId: "org2" }));
  });
  it("does nothing for a company that is no agency, an unknown profile or when disabled", async () => {
    for (const over of [{ isAgency: vi.fn(async () => false) }, { find: vi.fn(async () => null) }, { enabled: () => false }]) {
      const d = search(over);
      expect(await searchOwnCustomers("p1", undefined, d)).toBeNull();
      expect(d.request).not.toHaveBeenCalled();
    }
  });
  it("never throws", async () => {
    const d = search({ request: vi.fn(async () => { throw new Error("trasigt"); }) });
    expect(await searchOwnCustomers("p1", undefined, d)).toBeNull();
  });
});
