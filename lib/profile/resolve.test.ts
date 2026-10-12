import { describe, expect, it } from "vitest";
import { BolagsverketError } from "@/lib/bolagsverket/client";
import { parseProfileInput } from "./input";
import { resolveInput, type ResolveDeps } from "./resolve";

const org = (name: string, city = "Malmö") => ({ orgnr: "556503-8212", name, otherNames: [], legalForm: null, registeredAt: null, active: true, deregisteredAt: null, deregistrationReason: null, proceedings: [], description: null, sni: [], address: { street: null, postalCode: null, city, co: null }, advertisingBlocked: null, unavailable: [] });
const catalog = (over: Record<string, unknown> = {}) => ({ id: "c1", name: "Katalogbolaget AB", orgnr: "556503-8212", domain: null, website: null, registry: null, dedupe_key: "k", ...over });

function deps(over: Partial<ResolveDeps> & { calls?: string[] } = {}): ResolveDeps & { calls: string[] } {
  const calls = over.calls ?? [];
  return {
    findCompanyByOrgnr: async () => { calls.push("catalog-orgnr"); return null; },
    findCompanyByDomain: async () => { calls.push("catalog-domain"); return null; },
    getOrganisation: async () => { calls.push("bolagsverket"); return org("Test AB"); },
    findWebsiteByName: async () => { calls.push("places"); return null; },
    bolagsverket: { configured: true, test: false },
    placesConfigured: true,
    ...over,
    calls,
  } as ResolveDeps & { calls: string[] };
}
const parse = (t: string) => {
  const p = parseProfileInput(t);
  if (p.kind !== "orgnr" && p.kind !== "url") throw new Error("fel testdata");
  return p;
};

describe("resolveInput: web address", () => {
  it("trusts the address the user gave, and picks up what the catalog knows", async () => {
    const d = deps({ findCompanyByDomain: async () => catalog({ domain: "foretag.se" }) as never });
    expect(await resolveInput(parse("foretag.se"), d)).toMatchObject({ kind: "url", domain: "foretag.se", websiteSource: "input", websiteVerified: true, orgnr: "556503-8212", name: "Katalogbolaget AB" });
  });
  it("works for a site the catalog has never seen, and calls nothing external", async () => {
    const d = deps();
    const r = await resolveInput(parse("https://www.nytt.se/om"), d);
    expect(r).toMatchObject({ domain: "nytt.se", orgnr: null, catalog: null });
    expect(d.calls).toEqual(["catalog-domain"]);
  });
});

describe("resolveInput: org.nr in the catalog with a website", () => {
  it("uses the catalog and stops: no Bolagsverket and no Places call", async () => {
    const d = deps({ findCompanyByOrgnr: async () => catalog({ domain: "katalog.se" }) as never });
    const r = await resolveInput(parse("556503-8212"), d);
    expect(r).toMatchObject({ domain: "katalog.se", websiteSource: "catalog", websiteVerified: true });
    expect(d.calls).toEqual([]);
  });
});

describe("resolveInput: org.nr without a known website", () => {
  it("asks Bolagsverket for name and city, then Places, and marks the site as not confirmed", async () => {
    const d = deps({ findWebsiteByName: async (n, c) => { d.calls.push(`places:${n}:${c}`); return { placeId: "p", name: "Test", address: null, domain: "test.se", phone: null, mapsUrl: null }; } });
    const r = await resolveInput(parse("556503-8212"), d);
    expect(r).toMatchObject({ domain: "test.se", websiteSource: "places", websiteVerified: false, name: "Test AB", city: "Malmö" });
    expect(d.calls).toEqual(["catalog-orgnr", "bolagsverket", "places:Test AB:Malmö"]);
    expect(r.warnings.join(" ")).toContain("inte bekräftad");
  });
  it("continues without a website when Places finds nothing, or only a place without one", async () => {
    expect((await resolveInput(parse("556503-8212"), deps())).warnings).toContain("Ingen webbplats hittades för företaget.");
    const noSite = deps({ findWebsiteByName: async () => ({ placeId: "p", name: "Test", address: "Gata 1", domain: null, phone: null, mapsUrl: null }) });
    const r = await resolveInput(parse("556503-8212"), noSite);
    expect(r).toMatchObject({ domain: null, websiteSource: "none" });
    expect(r.place).not.toBeNull();
  });
  it("says so when Bolagsverket is not configured, in test mode, down, or does not know the number", async () => {
    expect((await resolveInput(parse("556503-8212"), deps({ bolagsverket: { configured: false, test: false } }))).warnings[0]).toContain("inte konfigurerat");
    expect((await resolveInput(parse("556503-8212"), deps({ bolagsverket: { configured: true, test: true } }))).warnings[0]).toContain("testläge");
    expect((await resolveInput(parse("556503-8212"), deps({ getOrganisation: async () => { throw new BolagsverketError("x", true); } }))).warnings[0]).toContain("svarade inte");
    expect((await resolveInput(parse("556503-8212"), deps({ getOrganisation: async () => null }))).warnings[0]).toContain("hittades inte");
  });
  it("does not call Places without a name, or without a key", async () => {
    const noName = deps({ getOrganisation: async () => null });
    await resolveInput(parse("556503-8212"), noName);
    expect(noName.calls).not.toContain("places");
    const noKey = deps({ placesConfigured: false });
    const r = await resolveInput(parse("556503-8212"), noKey);
    expect(noKey.calls).not.toContain("places");
    expect(r.warnings.join(" ")).toContain("Google Places är inte konfigurerat");
  });
});

describe("resolveInput: sole trader", () => {
  it("never looks the number up in the catalog, keeps it only in memory, and shows the masked form", async () => {
    const d = deps();
    const r = await resolveInput(parse("670406-1230"), d);
    expect(r).toMatchObject({ soleTrader: true, orgnrDisplay: "670406-****", orgnr: "670406-1230" });
    expect(d.calls).not.toContain("catalog-orgnr");
    expect(JSON.stringify({ ...r, orgnr: undefined })).not.toContain("1230");
  });
});
