import { describe, expect, it, vi } from "vitest";
import { chooseHistoryIps, chooseViewdnsLookups, discoverCandidates, type DiscoverDeps } from "./discover";

const agency = { name: "Conseo Webb", domain: "conseo.se" };
const ctx = { signal: new AbortController().signal, log: () => {} };

describe("chooseHistoryIps", () => {
  const history = [{ ip: "65.20.114.37", lastSeen: "2026-10-20" }, { ip: "172.105.250.144", lastSeen: "2025-03-24" }, { ip: "172.105.250.144", lastSeen: "2024-01-01" }, { ip: "10.0.0.1", lastSeen: "2023-01-01" }];
  it("skips the addresses the agency has now and repeats, keeping the most recent first", () => {
    expect(chooseHistoryIps(history, ["65.20.114.37"])).toEqual(["172.105.250.144", "10.0.0.1"]);
  });
  it("stops at the limit", () => {
    expect(chooseHistoryIps(history, [], 1)).toEqual(["65.20.114.37"]);
  });
});

describe("chooseViewdnsLookups", () => {
  it("looks up its own name servers, and a single own IP", () => {
    expect(chooseViewdnsLookups({ ns: ["ns1.conseo.se."], a: ["203.0.113.7"] }, "conseo.se")).toEqual([{ endpoint: "reversens", target: "ns1.conseo.se" }, { endpoint: "reverseip", target: "203.0.113.7" }]);
  });
  it("skips provider name servers, several IPs and known hosts", () => {
    expect(chooseViewdnsLookups({ ns: ["ada.ns.cloudflare.com"], a: ["1.1.1.1", "1.1.1.2"] }, "conseo.se")).toEqual([]);
    expect(chooseViewdnsLookups({ ns: [], a: ["76.76.21.21"] }, "conseo.se")).toEqual([]);
  });
});

function deps(over: Partial<DiscoverDeps> = {}): DiscoverDeps {
  return {
    catalog: vi.fn(async () => ["kund1.se"]),
    publicwww: vi.fn(async () => ({ domains: [{ domain: "kund1.se", url: "https://kund1.se/" }, { domain: "kund2.se", url: "https://kund2.se/" }, { domain: "conseo.se", url: null }, { domain: "blogg.conseo.se", url: null }], truncated: false })),
    viewdns: vi.fn(async () => [{ domain: "kund3.se", server: null }, { domain: "KUND2.se", server: { ip: "203.0.113.7", size: 3 } }]),
    viewdnsConfigured: () => true,
    claude: vi.fn(async () => []),
    claudeConfigured: () => false,
    backlinks: vi.fn(async () => ({ candidates: [], total: 0, credits: null, dropped: 0 })),
    backlinksConfigured: () => false,
    site: vi.fn(async () => []),
    ...over,
  };
}
const opts = { max: 300, useViewdns: true, rejected: new Set<string>() };

describe("discoverCandidates", () => {
  it("merges the sources, catalogue first, without duplicates or the agency's own domain", async () => {
    const r = await discoverCandidates(agency, opts, ctx, deps());
    expect(r.candidates.map((c) => [c.domain, c.via])).toEqual([["kund1.se", "katalog"], ["kund2.se", "publicwww"], ["kund3.se", "viewdns"]]);
    expect(r.truncated).toBe(false);
  });
  it("leaves out domains someone removed, and caps the list", async () => {
    expect((await discoverCandidates(agency, { ...opts, rejected: new Set(["kund2.se"]) }, ctx, deps())).candidates.map((c) => c.domain)).toEqual(["kund1.se", "kund3.se"]);
    const r = await discoverCandidates(agency, { ...opts, max: 2 }, ctx, deps());
    expect(r.candidates).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });
  it("carries on without ViewDNS when it is off, unconfigured or fails, but not without PublicWWW", async () => {
    const off = deps();
    await discoverCandidates(agency, { ...opts, useViewdns: false }, ctx, off);
    expect(off.viewdns).not.toHaveBeenCalled();
    expect((await discoverCandidates(agency, opts, ctx, deps({ viewdns: vi.fn(async () => { throw new Error("nere"); }) }))).candidates.map((c) => c.domain)).toEqual(["kund1.se", "kund2.se"]);
  });
  it("carries on without PublicWWW when its quota is gone, and says so", async () => {
    const out = deps({ publicwww: vi.fn(async () => { throw new Error("kvoten är slut"); }) });
    const r = await discoverCandidates(agency, opts, ctx, out);
    expect(r.candidates.map((c) => c.domain)).toEqual(["kund1.se", "kund3.se", "kund2.se"]);
    expect(r.notes).toContain("PublicWWW hoppades över: kvoten är slut");
  });
  it("fails with a readable reason only when no source could be used and nothing was found", async () => {
    const broken = deps({ catalog: async () => [], publicwww: async () => { throw new Error("kvoten är slut"); }, viewdnsConfigured: () => false, claudeConfigured: () => false });
    await expect(discoverCandidates(agency, { ...opts, useClaude: true }, ctx, broken)).rejects.toThrow(/Ingen källa.*PublicWWW hoppades över: kvoten är slut.*Claude hoppades över: ingen API-nyckel/);
    // Katalogen ensam räcker, och Claude som fallerar ger en anteckning.
    const some = deps({ publicwww: async () => { throw new Error("slut"); }, claude: async () => { throw new Error("arbetsyta saknas"); }, claudeConfigured: () => true });
    const r = await discoverCandidates(agency, { ...opts, useClaude: true }, ctx, some);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.notes.join(" ")).toContain("Claude hoppades över: arbetsyta saknas");
  });

  it("adds Claude's suggestions with their proof, ahead of the bulk PublicWWW list, and tells Claude what is already known", async () => {
    const claude = vi.fn(async (_agency: unknown, _known: string[]) => [{ domain: "ny.se", evidenceUrl: "https://conseo.se/kunder", evidenceQuote: "Ny AB" }, { domain: "kund1.se", evidenceUrl: "https://conseo.se/kunder", evidenceQuote: null }]);
    const r = await discoverCandidates(agency, { ...opts, useClaude: true, max: 3 }, ctx, deps({ claude, claudeConfigured: () => true }));
    expect(claude.mock.calls[0][1]).toEqual(expect.arrayContaining(["kund1.se", "kund2.se"]));
    expect(r.candidates.map((c) => [c.domain, c.via])).toEqual([["kund1.se", "katalog"], ["ny.se", "claude"], ["kund2.se", "publicwww"]]);
    expect(r.candidates[1].evidence).toEqual({ url: "https://conseo.se/kunder", quote: "Ny AB" });
  });
  it("carries on when Claude fails or is not configured", async () => {
    const failing = deps({ claude: vi.fn(async () => { throw new Error("slut på kredit"); }), claudeConfigured: () => true });
    expect((await discoverCandidates(agency, { ...opts, useClaude: true }, ctx, failing)).candidates.length).toBeGreaterThan(0);
    const off = deps({ claudeConfigured: () => false });
    await discoverCandidates(agency, { ...opts, useClaude: true }, ctx, off);
    expect(off.claude).not.toHaveBeenCalled();
  });

  it("takes backlink candidates with their hint, ahead of Claude and PublicWWW, and says when OpenSEO is not configured", async () => {
    const backlinks = vi.fn(async () => ({ candidates: [{ domain: "bl1.se", urlFrom: "https://bl1.se/om", anchor: "Byggd med ♥ av Capace Media", strength: "credit" as const, partner: false }, { domain: "kund2.se", urlFrom: "https://kund2.se/", anchor: "Capace Media", strength: "name" as const, partner: false }], total: 133, credits: 9900, dropped: 20 }));
    const r = await discoverCandidates(agency, { ...opts, max: 4 }, ctx, deps({ backlinks, backlinksConfigured: () => true }));
    expect(r.candidates.map((c) => [c.domain, c.via])).toEqual([["kund1.se", "katalog"], ["bl1.se", "backlinks"], ["kund2.se", "backlinks"], ["kund3.se", "viewdns"]]);
    expect(r.candidates[1].hint).toEqual({ urlFrom: "https://bl1.se/om", anchor: "Byggd med ♥ av Capace Media" });
    const off = await discoverCandidates(agency, opts, ctx, deps());
    expect(off.notes).toContain("OpenSEO hoppades över: ingen nyckel är konfigurerad.");
  });
  it("carries on when OpenSEO fails or is out of credits", async () => {
    const failing = deps({ backlinks: async () => { throw new Error("OpenSEO har bara 120 krediter kvar"); }, backlinksConfigured: () => true });
    const r = await discoverCandidates(agency, opts, ctx, failing);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.notes).toContain("OpenSEO hoppades över: OpenSEO har bara 120 krediter kvar");
  });

  it("only asks Claude when the other sources found few candidates", async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ domain: `m${i}.se`, url: null }));
    const busy = deps({ publicwww: async () => ({ domains: many, truncated: false }), claudeConfigured: () => true });
    await discoverCandidates(agency, { ...opts, useClaude: true, max: 100 }, ctx, busy);
    expect(busy.claude).not.toHaveBeenCalled();
    const quiet = deps({ claudeConfigured: () => true });
    await discoverCandidates(agency, { ...opts, useClaude: true }, ctx, quiet);
    expect(quiet.claude).toHaveBeenCalledTimes(1);
  });
  it("skips Claude, with a note, when the day's Claude spend is used up", async () => {
    const d = deps({ claudeConfigured: () => true });
    const r = await discoverCandidates(agency, { ...opts, useClaude: true, spend: { credits: 0, costSek: 60 } }, ctx, d);
    expect(d.claude).not.toHaveBeenCalled();
    expect(r.notes).toContain("Claude hoppades över: dagens tak för Claude är nått.");
  });
  it("gives OpenSEO only what is left of the day's credits, and adds what it cost to the usage", async () => {
    const backlinks = vi.fn(async (_a: unknown, _c: unknown, _o: { budget: number }) => ({ candidates: [], total: 500, credits: 8000, dropped: 0, creditsUsed: 60, more: true }));
    const d = deps({ backlinks, backlinksConfigured: () => true });
    const r = await discoverCandidates(agency, { ...opts, spend: { credits: 1100, costSek: 0 } }, ctx, d);
    expect(backlinks.mock.calls[0][2].budget).toBe(100);
    expect(r.usage.credits).toBe(60);
    expect(r.notes.join(" ")).toContain("budgeten på 100 krediter");
  });
  it("skips OpenSEO when no credits are left today", async () => {
    const d = deps({ backlinks: async () => { throw new Error("Dygnets tak för OpenSEO-krediter är nått."); }, backlinksConfigured: () => true });
    const r = await discoverCandidates(agency, { ...opts, spend: { credits: 1200, costSek: 0 } }, ctx, d);
    expect(r.notes.join(" ")).toContain("OpenSEO hoppades över");
  });
});


describe("learned traces", () => {
  it("hands the traces that proved many customers to the source-code search", async () => {
    const d = deps();
    await discoverCandidates(agency, { max: 100, useViewdns: false, rejected: new Set(), learned: ["conseo_design_data"] }, ctx, d);
    expect(d.publicwww).toHaveBeenCalledWith(agency, ctx, ["conseo_design_data"]);
  });
  it("passes none when nothing is learned yet", async () => {
    const d = deps();
    await discoverCandidates(agency, { max: 100, useViewdns: false, rejected: new Set() }, ctx, d);
    expect(d.publicwww).toHaveBeenCalledWith(agency, ctx, []);
  });
});
