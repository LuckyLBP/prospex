import { describe, expect, it, vi } from "vitest";
import { hitsFromResponse, MAX_SEARCH_QUERIES, searchAgencyMentions, searchQueries } from "./search";

const dp = { name: "Digipartner Sverige AB", domain: "digipartner.se" };
const ctx = { signal: new AbortController().signal, log: () => {} };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const results = (...urls: string[]) => ({ web: { results: urls.map((url) => ({ url })) } });

describe("searchQueries", () => {
  it("asks for pages linking to the domain and for credit phrases with the brand, never the agency's own site", () => {
    const q = searchQueries(dp);
    expect(q[0]).toBe('"digipartner.se" -site:digipartner.se');
    expect(q).toContain('"Skapad av digipartner" -site:digipartner.se');
    expect(q.length).toBeLessThanOrEqual(MAX_SEARCH_QUERIES);
  });
});

describe("hitsFromResponse", () => {
  it("keeps other sites' domains and drops the agency, its subdomains and social media", () => {
    const hits = hitsFromResponse(results("https://www.skogma.se/om-oss", "https://digipartner.se/x", "https://blogg.digipartner.se/", "https://www.facebook.com/digipartner.se"), dp);
    expect(hits).toEqual([{ domain: "skogma.se", url: "https://www.skogma.se/om-oss" }]);
  });
});

describe("searchAgencyMentions", () => {
  it("collects one hit per domain across the queries and counts the queries made", async () => {
    const fetchFn = vi.fn(async () => json(results("https://skogma.se/a", "https://musikanten.nu/"))) as unknown as typeof fetch;
    const r = await searchAgencyMentions(dp, ctx, { fetch: fetchFn, apiKey: "k" });
    expect(r.hits.map((h) => h.domain)).toEqual(["skogma.se", "musikanten.nu"]);
    expect(r.queries).toBe(searchQueries(dp).length);
  });
  it("sends the key in the token header and not in the URL", async () => {
    const fetchFn = vi.fn(async () => json(results())) as unknown as typeof fetch;
    await searchAgencyMentions(dp, ctx, { fetch: fetchFn, apiKey: "secret" });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>)["X-Subscription-Token"]).toBe("secret");
  });
  it("stops the whole step when the quota is out or the key is wrong", async () => {
    const fetchFn = vi.fn(async () => json({}, 429)) as unknown as typeof fetch;
    await expect(searchAgencyMentions(dp, ctx, { fetch: fetchFn, apiKey: "k" })).rejects.toThrow(/429/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("skips one failing query and goes on", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => (n++ === 0 ? json({}, 500) : json(results("https://skogma.se/")))) as unknown as typeof fetch;
    const r = await searchAgencyMentions(dp, ctx, { fetch: fetchFn, apiKey: "k" });
    expect(r.hits).toHaveLength(1);
  });
  it("refuses to run without a key", async () => {
    await expect(searchAgencyMentions(dp, ctx, { fetch: vi.fn() as never, apiKey: undefined })).rejects.toThrow(/BRAVE_SEARCH_API_KEY/);
  });
});
