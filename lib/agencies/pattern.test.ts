import { describe, expect, it, vi } from "vitest";
import { acceptPatterns, analyseSitePattern, condenseSource, customerPatternCandidates, measurePattern, type PatternDeps, type PatternSearchDeps } from "./pattern";

const ctx = { signal: new AbortController().signal, log: () => {} };

const HOME = `<html><head><title>Gullringens Allservice</title>
<meta name="generator" content="Mono 4.2">
<link rel="stylesheet" href="https://site-assets.cdnmns.com/abc123/css/main.css">
<script src="https://www.googletagmanager.com/gtm.js?id=GTM-1"></script>
<style>:root{--jok-nav-bg:#fff;--jok-nav-bg:#eee}</style>
<!-- Built with Mono Solutions -->
</head><body data-wf-page="x"><img src="data:image/png;base64,AAAA"><footer>Footer</footer>
<script>window.__mns = {"site":"abc123"};</script></body></html>`;

describe("condenseSource", () => {
  it("keeps what can carry a builder's trace and drops data URIs and prose", () => {
    const c = condenseSource(HOME);
    expect(c).toContain("title: Gullringens Allservice");
    expect(c).toContain("meta generator: Mono 4.2");
    expect(c).toContain("link href=https://site-assets.cdnmns.com/abc123/css/main.css");
    expect(c).toContain("css-variabler: --jok-nav-bg");
    expect(c).toContain("data-attribut: data-wf-page");
    expect(c).toContain("<!-- Built with Mono Solutions -->");
    expect(c).toContain("window.__mns");
    expect(c).not.toContain("base64");
    expect(c).not.toContain("Footer");
  });
  it("never exceeds the limit", () => {
    expect(condenseSource(HOME.repeat(200), 500).length).toBeLessThanOrEqual(500);
  });
});

describe("acceptPatterns", () => {
  const p = (text: string) => ({ text, why: "w" });
  it("accepts a string that is in the source, and drops one that is not (an invention)", () => {
    expect(acceptPatterns([p("site-assets.cdnmns.com"), p("invented-cdn.example.net")], [HOME]).map((x) => x.text)).toEqual(["site-assets.cdnmns.com"]);
  });
  it("drops generic strings that thousands of unrelated sites share", () => {
    const html = `<script src="https://www.googletagmanager.com/gtm.js"></script><link href="/wp-content/plugins/elementor/x.css"><link href="/wp-includes/js/jquery.js">`;
    expect(acceptPatterns([p("googletagmanager.com/gtm.js"), p("wp-content/plugins/elementor"), p("wp-includes/js/jquery.js")], [html])).toEqual([]);
  });
  it("drops strings with spaces, quotes or the wrong length", () => {
    expect(acceptPatterns([p("two words"), p('a"quote-here'), p("short")], ["two words a\"quote-here short"])).toEqual([]);
  });
  it("requires the pattern in most of the customers' sources, not just one", () => {
    const sources = ["x cdnmns-pattern-1 y", "x cdnmns-pattern-1 y", "no trace here", "x cdnmns-pattern-1 y", "other"];
    expect(acceptPatterns([p("cdnmns-pattern-1")], sources, { minShare: 0.6 }).map((x) => x.found)).toEqual([3]);
    expect(acceptPatterns([p("cdnmns-pattern-1")], ["x cdnmns-pattern-1", "a", "b", "c"], { minShare: 0.6 })).toEqual([]);
  });
  it("does not accept a customer's own address as a pattern", () => {
    expect(acceptPatterns([p("https://kund.se/")], ["see https://kund.se/ here"], { ownDomains: ["kund.se"] })).toEqual([]);
  });
  it("keeps at most three and no duplicates", () => {
    const html = "alpha-trace-1 beta-trace-2 gamma-trace-3 delta-trace-4";
    expect(acceptPatterns(["alpha-trace-1", "alpha-trace-1", "beta-trace-2", "gamma-trace-3", "delta-trace-4"].map(p), [html])).toHaveLength(3);
  });
});

function claude(output: unknown, configured = true): PatternDeps {
  return { configured: () => configured, generate: vi.fn(async () => ({ output, totalUsage: { inputTokens: 1000, outputTokens: 100 } })) as never };
}
const searchDeps = (count: number | null, hits: string[] = [], configured = true): PatternSearchDeps & { search: ReturnType<typeof vi.fn> } => ({
  configured: () => configured,
  count: vi.fn(async () => count),
  search: vi.fn(async () => ({ hits: hits.map((domain) => ({ domain, url: `https://${domain}/` })), truncated: false })),
}) as never;
const verdict = (texts: string[], builder = { name: "Mono Solutions", domain: null, role: "platform" as const, basis: "CDN" }) => ({ builder, patterns: texts.map((text) => ({ text, why: "plattformens CDN" })) });

describe("measurePattern", () => {
  it("drops a pattern missing from the index, marks a big one as not narrow, and keeps an unreadable count searchable", async () => {
    expect(await measurePattern("x", searchDeps(0))).toBeNull();
    expect(await measurePattern("x", searchDeps(60636))).toEqual({ candidates: 60636, narrow: false });
    expect(await measurePattern("x", searchDeps(120))).toEqual({ candidates: 120, narrow: true });
    expect(await measurePattern("x", searchDeps(null))).toEqual({ candidates: null, narrow: true });
  });
});

describe("analyseSitePattern", () => {
  it("returns the builder and a validated pattern with its sibling sites, using one paid search", async () => {
    const s = searchDeps(500, ["gullringensallservice.se", "hantverkshuset.se", "mghusbesiktning.se"]);
    const r = await analyseSitePattern("gullringensallservice.se", HOME, ctx, { patterns: claude(verdict(["site-assets.cdnmns.com", "invented-thing-xyz"])), search: s });
    expect(r?.builder?.name).toBe("Mono Solutions");
    expect(r?.patterns).toEqual([{ text: "site-assets.cdnmns.com", why: "plattformens CDN", candidates: 500, sites: 2, examples: ["hantverkshuset.se", "mghusbesiktning.se"], more: false }]);
    expect(s.search).toHaveBeenCalledTimes(1);
  });
  it("shows a platform sized pattern with its count but does not spend a search on it (real: cdnmns.com, about 60,600 sites)", async () => {
    const s = searchDeps(60636, ["a.se"]);
    const r = await analyseSitePattern("x.se", HOME, ctx, { patterns: claude({ builder: { name: null, domain: null, role: "unknown", basis: "" }, patterns: [{ text: "site-assets.cdnmns.com", why: "w" }] }), search: s });
    expect(r?.patterns).toEqual([{ text: "site-assets.cdnmns.com", why: "w", candidates: 60636, sites: null, examples: [], more: false }]);
    expect(s.search).not.toHaveBeenCalled();
  });
  it("drops a pattern that no stored page has", async () => {
    const r = await analyseSitePattern("x.se", HOME, ctx, { patterns: claude({ builder: { name: null, domain: null, role: "unknown", basis: "" }, patterns: [{ text: "site-assets.cdnmns.com", why: "w" }] }), search: searchDeps(0) });
    expect(r).toBeNull();
  });
  it("still shows the pattern, without a count, when search is not configured", async () => {
    const r = await analyseSitePattern("x.se", HOME, ctx, { patterns: claude(verdict(["site-assets.cdnmns.com"])), search: searchDeps(10, [], false) });
    expect(r?.patterns[0]).toMatchObject({ text: "site-assets.cdnmns.com", candidates: null, sites: null });
  });
  it("gives null without a Claude key, and never throws when Claude fails", async () => {
    expect(await analyseSitePattern("x.se", HOME, ctx, { patterns: claude(null, false), search: searchDeps(1) })).toBeNull();
    const broken: PatternDeps = { configured: () => true, generate: vi.fn(async () => { throw new Error("overloaded"); }) as never };
    expect(await analyseSitePattern("x.se", HOME, ctx, { patterns: broken, search: searchDeps(1) })).toBeNull();
  });
});

describe("customerPatternCandidates", () => {
  const agency = { name: "TeamRobin", domain: "teamrobin.com" };
  const customers = ["a.se", "b.se", "c.se", "d.se"];
  const pages = (d: string) => (d === "d.se" ? "no trace" : `<link href="https://site-assets.cdnmns.com/${d}/x.css">`);
  const fetchHome = async (d: string) => pages(d);

  it("finds sites that share a pattern most of the customers have, skipping the customers themselves", async () => {
    const s = searchDeps(300, ["a.se", "ny1.se", "ny2.se", "teamrobin.com"]);
    const r = await customerPatternCandidates(agency, customers, ctx, { patterns: claude(verdict(["site-assets.cdnmns.com"])), search: s, fetchHome });
    expect(r.map((c) => c.domain)).toEqual(["ny1.se", "ny2.se"]);
    expect(r[0].pattern).toBe("site-assets.cdnmns.com");
  });
  it("skips a platform sized pattern: it would only give unrelated sites", async () => {
    const s = searchDeps(60636, ["x.se"]);
    expect(await customerPatternCandidates(agency, customers, ctx, { patterns: claude(verdict(["site-assets.cdnmns.com"])), search: s, fetchHome })).toEqual([]);
    expect(s.search).not.toHaveBeenCalled();
  });
  it("does nothing with fewer than three customers, or when the pattern is only on one of them", async () => {
    expect(await customerPatternCandidates(agency, ["a.se", "b.se"], ctx, { patterns: claude(verdict(["site-assets.cdnmns.com"])), search: searchDeps(10, ["z.se"]), fetchHome })).toEqual([]);
    const oneOnly = async (d: string) => (d === "a.se" ? "has only-here-trace-1" : "nothing");
    expect(await customerPatternCandidates(agency, customers, ctx, { patterns: claude(verdict(["only-here-trace-1"])), search: searchDeps(10, ["z.se"]), fetchHome: oneOnly })).toEqual([]);
  });
});
