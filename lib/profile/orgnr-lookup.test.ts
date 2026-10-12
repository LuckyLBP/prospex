import { describe, expect, it, vi } from "vitest";
import type { LegalNameCandidate } from "./legal-name";
import { registryMatches, resolveOrgnrByName, type LookupDeps, type OrgnrProposal } from "./orgnr-lookup";

const sa: LegalNameCandidate = { name: "SA Konstruktion & Bygg AB", street: "Åkermans väg 3", postalCode: "50431", city: "Borås", source: "text" };
const REAL = { name: "SA konstruktion och bygg Aktiebolag", address: { street: "Åkermans Väg 3", postalCode: "50431", city: "BORÅS" } };
const org = (over: Record<string, unknown> = {}) => ({ ...REAL, ...over }) as never;

function deps(proposals: OrgnrProposal[], registry: Record<string, unknown> = { "556767-1796": REAL }, configured = true): LookupDeps & { propose: ReturnType<typeof vi.fn>; lookups: string[] } {
  const lookups: string[] = [];
  return { configured: () => configured, propose: vi.fn(async () => proposals), registry: async (n: string) => { lookups.push(n); return (registry[n] as never) ?? null; }, lookups } as never;
}
const p = (orgnr: string): OrgnrProposal => ({ orgnr, name: null, sourceUrl: null });

describe("registryMatches", () => {
  it("accepts the same company written differently: '&' and 'och', 'AB' and 'Aktiebolag', letter case, city in capitals", () => {
    expect(registryMatches(sa, org())).toBe(true);
  });
  it("rejects a similar name in another city, and a different name in the right city", () => {
    expect(registryMatches(sa, org({ address: { postalCode: "41101", city: "GÖTEBORG" } }))).toBe(false);
    expect(registryMatches(sa, org({ name: "SA Fastigheter Aktiebolag" }))).toBe(false);
  });
  it("accepts on postal code when the city is written differently", () => {
    expect(registryMatches({ ...sa, city: "Boras" }, org())).toBe(true);
    expect(registryMatches({ ...sa, city: null }, org())).toBe(true);
  });
  it("needs an identical name when the page gives no address at all", () => {
    const bare = { ...sa, city: null, postalCode: null, street: null };
    expect(registryMatches(bare, org())).toBe(true);
    expect(registryMatches({ ...bare, name: "SA Bygg AB" }, org())).toBe(false);
  });
});

describe("resolveOrgnrByName", () => {
  it("returns a proposed number that Bolagsverket confirms", async () => {
    const d = deps([p("5567671796")]);
    expect(await resolveOrgnrByName([sa], d)).toMatchObject({ ok: true, orgnr: "556767-1796", registryName: "SA konstruktion och bygg Aktiebolag", city: "BORÅS" });
  });
  it("skips a wrong first proposal and takes the right one", async () => {
    const d = deps([p("556000-0001"), p("556767-1796")], { "556000-0001": org({ name: "Helt Annat AB", address: { city: "MALMÖ", postalCode: "21111" } }), "556767-1796": REAL });
    expect(await resolveOrgnrByName([sa], d)).toMatchObject({ ok: true, orgnr: "556767-1796" });
  });
  it("never uses a number that is invalid, a personnummer-style number, or not in the registry", async () => {
    const d = deps([p("556767-1797"), p("670406-1234"), p("not a number"), p("556503-8212")]);
    expect(await resolveOrgnrByName([sa], d)).toEqual({ ok: false, reason: "no-match" });
    expect(d.lookups).toEqual(["556503-8212"]);
  });
  it("says why it found nothing", async () => {
    expect(await resolveOrgnrByName([sa], deps([]))).toEqual({ ok: false, reason: "no-proposal" });
    expect(await resolveOrgnrByName([], deps([]))).toEqual({ ok: false, reason: "no-candidate" });
    const off = deps([p("556767-1796")], undefined, false);
    expect(await resolveOrgnrByName([sa], off)).toEqual({ ok: false, reason: "not-configured" });
    expect(off.propose).not.toHaveBeenCalled();
  });
  it("tries the next name when the first gives nothing, but never more than two", async () => {
    const d = deps([]);
    await resolveOrgnrByName([sa, { ...sa, name: "Annat AB" }, { ...sa, name: "Tredje AB" }], d);
    expect(d.propose).toHaveBeenCalledTimes(2);
  });

  it("only tries names that come with a city or postal code, so a footer credit to an agency is never looked up", async () => {
    const agency: LegalNameCandidate = { name: "Webb of Sweden AB", street: null, postalCode: null, city: null, source: "text" };
    const d = deps([p("559329-3383")], { "559329-3383": org({ name: "Webb of Sweden AB", address: { city: "MALMÖ", postalCode: "21111" } }) });
    expect(await resolveOrgnrByName([agency], d)).toEqual({ ok: false, reason: "no-candidate" });
    expect(d.propose).not.toHaveBeenCalled();
  });

  it("accepts a shortened name when street and postal code match exactly, but not when the street differs", async () => {
    const foxor: LegalNameCandidate = { name: "Foxor AB", street: "Sporregatan 20", postalCode: "21377", city: "Malmö", source: "text" };
    const reg = { name: "Foxor Bygg AB", address: { street: "Sporregatan 20", postalCode: "21377", city: "MALMÖ" } };
    expect(registryMatches(foxor, reg as never)).toBe(true);
    expect(registryMatches({ ...foxor, street: "Annangatan 5" }, reg as never)).toBe(false);
    expect(registryMatches({ ...foxor, name: "Helt Annat AB" }, reg as never)).toBe(false);
  });
});

