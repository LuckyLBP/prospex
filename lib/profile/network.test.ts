import { describe, expect, it } from "vitest";
import { FactBook } from "./facts";
import { buildNetwork, presenceFacts, type NetworkDeps } from "./network";
import { presenceDisclaimer, type PresenceItem } from "./presence";

const item = (over: Partial<PresenceItem> = {}): PresenceItem => ({ slug: "brabyggare", name: "BraByggare", kind: "supplier", published: true, logoPath: "b.png", category: null, namesBrand: true, sourceUrl: "https://brabyggare.se/hantverkare/12/", firstSeen: "2026-10-01T00:00:00.000Z", lastSeen: "2026-10-09T00:00:00.000Z", ...over });

function deps(over: Partial<NetworkDeps> & { calls?: string[] } = {}): NetworkDeps & { calls: string[] } {
  const calls = over.calls ?? [];
  return {
    resolveLogo: async (i) => { calls.push(`logo:${i.domain ?? i.name}:${i.useCatalog === false ? "own" : "cat"}`); return { path: `${i.domain}-1.png`, source: "fetched", supplierSlug: null }; },
    getPresence: async () => [item()],
    suppliersByDomain: async () => new Map([["bokadirekt.se", "bokadirekt"]]),
    ...over,
    calls,
  } as NetworkDeps & { calls: string[] };
}
const base = { creator: { name: "Infront Media", url: "https://infront.se", domain: "infront.se" }, siteDomain: "roranderor.se", companyName: "Rörande Rör AB", companyId: "c1", platformLinks: [{ domain: "bokadirekt.se", name: "Bokadirekt", kind: "Bokning" as const, url: "https://bokadirekt.se/x" }, { domain: "eniro.se", name: "Eniro", kind: "Katalog" as const, url: "https://eniro.se/y" }] };

describe("buildNetwork", () => {
  it("collects both logos, our own presence and which linked platforms are sources of ours", async () => {
    const d = deps();
    const n = await buildNetwork(base, d);
    expect(n.creator).toEqual({ name: "Infront Media", url: "https://infront.se", domain: "infront.se", logoPath: "infront.se-1.png", supplierSlug: null, kind: null, kindSource: null, basis: "footer" });
    expect(n.companyLogoPath).toBe("roranderor.se-1.png");
    expect(n.presence).toHaveLength(1);
    expect(n.platformLinks.map((p) => [p.name, p.supplierSlug])).toEqual([["Bokadirekt", "bokadirekt"], ["Eniro", null]]);
    expect(d.calls.sort()).toEqual(["logo:infront.se:cat", "logo:roranderor.se:own"]);
  });
  it("does not use the catalog for the company's own logo, and uses it for the agency's", async () => {
    const d = deps();
    await buildNetwork(base, d);
    expect(d.calls).toContain("logo:roranderor.se:own");
    expect(d.calls).toContain("logo:infront.se:cat");
  });
  it("keeps the agency's source slug when the catalog matched it", async () => {
    const d = deps({ resolveLogo: async () => ({ path: "x.png", source: "supplier", supplierSlug: "infront" }) });
    expect((await buildNetwork(base, d)).creator?.supplierSlug).toBe("infront");
  });
  it("works with nothing: no agency, no site, no company in the catalog", async () => {
    const d = deps({ getPresence: async () => [] });
    const n = await buildNetwork({ creator: null, siteDomain: null, companyName: null, platformLinks: [], companyId: null }, d);
    expect(n).toEqual({ creator: null, companyLogoPath: null, platformLinks: [], presence: [] });
    expect(d.calls).toEqual([]);
  });
  it("turns a failure in any part into an empty part, never an error", async () => {
    const boom = async () => { throw new Error("nere"); };
    const n = await buildNetwork(base, { resolveLogo: boom, getPresence: boom, suppliersByDomain: boom });
    expect(n.creator).toMatchObject({ name: "Infront Media", logoPath: null });
    expect(n.companyLogoPath).toBeNull();
    expect(n.presence).toEqual([]);
    expect(n.platformLinks.every((p) => p.supplierSlug === null)).toBe(true);
  });
});

describe("presenceFacts", () => {
  it("adds one fact per source, with the page at the source as its source", () => {
    const b = new FactBook();
    presenceFacts(b, [item(), item({ slug: "redovisning", name: "Redovisningsbyråer", kind: "list", category: "Bransch", namesBrand: false, sourceUrl: null })]);
    expect(b.all().map((f) => [f.label, f.value, f.source, f.kind])).toEqual([
      ["Finns hos BraByggare", "källa i vår katalog", "https://brabyggare.se/hantverkare/12/", "directory"],
      ["Finns hos Redovisningsbyråer", "lista, Bransch", "Prospex katalog", "directory"],
    ]);
  });
});

describe("presenceDisclaimer", () => {
  it("names suppliers and branded lists, as the copy rules require", () => {
    expect(presenceDisclaimer([item(), item({ slug: "dorunner", name: "Dorunner" })])).toBe("Vi har ingen koppling till BraByggare eller Dorunner.");
  });
  it("says nothing for a list that does not name a brand, or for no sources", () => {
    expect(presenceDisclaimer([item({ kind: "list", namesBrand: false, name: "Redovisningsbyråer" })])).toBe("");
    expect(presenceDisclaimer([])).toBe("");
  });
});

describe("agencyFromPresence and the creator fallback", () => {
  const viewdns = item({ slug: "tundran", name: "Tundran Webbyrå", method: "viewdns", domain: null, sourceUrl: null, logoPath: "t.png" });

  it("names the agency whose own server the company is on, when the footer has no credit", async () => {
    const n = await buildNetwork({ ...base, creator: null }, deps({ getPresence: async () => [viewdns] }));
    expect(n.creator).toEqual({ name: "Tundran Webbyrå", url: null, domain: null, logoPath: "t.png", supplierSlug: "tundran", kind: "agency", kindSource: "rule", basis: "same-server" });
  });
  it("prefers the agency's own customer list over a shared server, and a footer credit over both", async () => {
    const agency = item({ slug: "capace", name: "Capace Media Group", method: "agency", domain: "capace.se" });
    const both = await buildNetwork({ ...base, creator: null }, deps({ getPresence: async () => [viewdns, agency] }));
    expect(both.creator).toMatchObject({ name: "Capace Media Group", basis: "agency-source", url: "https://capace.se", domain: "capace.se" });
    const footer = await buildNetwork(base, deps({ getPresence: async () => [viewdns, agency] }));
    expect(footer.creator).toMatchObject({ name: "Infront Media", basis: "footer" });
  });
  it("ignores lists and sources found by guessing (PublicWWW), so a platform list never becomes the agency", async () => {
    const list = item({ slug: "wix", name: "Egen sida i Wix", kind: "list", method: "publicwww" });
    const guess = item({ slug: "swapi", name: "Swapi", method: "publicwww" });
    const n = await buildNetwork({ ...base, creator: null }, deps({ getPresence: async () => [list, guess] }));
    expect(n.creator).toBeNull();
  });
});
