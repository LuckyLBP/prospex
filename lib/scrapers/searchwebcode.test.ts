import { describe, expect, it, vi } from "vitest";
import { countSwc, domainsFromResponse, fromPublicwww, searchSwc } from "./searchwebcode";

const ctx = { signal: new AbortController().signal };
const nosleep = async () => {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fromPublicwww", () => {
  it("turns a phrase with site:se into a phrase with tld=se", () => {
    expect(fromPublicwww('"wp-content/themes/Divi" site:se')).toEqual({ q: '"wp-content/themes/Divi"', tld: "se" });
  });
  it("keeps a plain quoted phrase as it is", () => {
    expect(fromPublicwww('"files.addictive.cloud"')).toEqual({ q: '"files.addictive.cloud"' });
  });
  it("quotes a query that contains quotes itself and escapes them", () => {
    expect(fromPublicwww('href="https://vaning18.se"')).toEqual({ q: '"href=\\"https://vaning18.se\\""' });
  });
});

describe("domainsFromResponse", () => {
  it("normalizes, drops www and duplicates", () => {
    expect(domainsFromResponse({ results: [{ domain: "www.a.se" }, { domain: "A.se" }, { url: "https://b.se/x" }, { domain: null }] })).toEqual(["a.se", "b.se"]);
  });
});

describe("countSwc", () => {
  it("asks for counts_only and returns the total and its kind", async () => {
    const f = vi.fn(async () => json({ total: 17350, count_kind: "partial" })) as unknown as typeof fetch;
    expect(await countSwc({ q: '"x"', tld: "se" }, ctx, { fetch: f, apiKey: "k", sleep: nosleep })).toEqual({ total: 17350, kind: "partial" });
    expect(String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("counts_only=true");
  });
});

describe("searchSwc", () => {
  it("pages with next_offset until maxResults and sums what it was charged", async () => {
    const pages = [
      json({ total: 900, next_offset: 256, charged_cents: 5, results: Array.from({ length: 256 }, (_, i) => ({ domain: `a${i}.se` })) }),
      json({ total: 900, next_offset: 512, charged_cents: 0, results: Array.from({ length: 256 }, (_, i) => ({ domain: `b${i}.se` })) }),
    ];
    const f = vi.fn(async () => pages.shift()!) as unknown as typeof fetch;
    const r = await searchSwc({ q: '"x"' }, 400, ctx, { fetch: f, apiKey: "k", sleep: nosleep });
    expect(r.domains).toHaveLength(400);
    expect(r).toMatchObject({ pages: 2, cents: 5, total: 900, truncated: true });
  });
  it("sends the key as a bearer token and never in the URL", async () => {
    const f = vi.fn(async () => json({ results: [] })) as unknown as typeof fetch;
    await searchSwc({ q: '"x"' }, 10, ctx, { fetch: f, apiKey: "swc_live_secret", sleep: nosleep });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer swc_live_secret");
  });
  it("fails clearly on a rejected key, empty balance and missing key", async () => {
    await expect(searchSwc({ q: '"x"' }, 10, ctx, { fetch: vi.fn(async () => json({}, 401)) as never, apiKey: "k", sleep: nosleep })).rejects.toThrow(/nyckeln/);
    await expect(searchSwc({ q: '"x"' }, 10, ctx, { fetch: vi.fn(async () => json({}, 402)) as never, apiKey: "k", sleep: nosleep })).rejects.toThrow(/saldot/);
    await expect(searchSwc({ q: '"x"' }, 10, ctx, { fetch: vi.fn() as never, apiKey: undefined, sleep: nosleep })).rejects.toThrow(/SEARCHWEBCODE_API_KEY/);
  });
});

describe("rate limits", () => {
  it("says how long to wait when the API answers 429 with Retry-After", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "600" } })) as unknown as typeof fetch;
    await expect(countSwc({ q: '"x"' }, ctx, { fetch: f, apiKey: "k", sleep: nosleep })).rejects.toThrow(/10 min/);
  });
  it("waits between calls so the key is not locked out", async () => {
    const sleeps: number[] = [];
    const f = vi.fn(async () => json({ results: [], total: 0 })) as unknown as typeof fetch;
    await countSwc({ q: '"x"' }, ctx, { fetch: f, apiKey: "k", sleep: async (ms) => { sleeps.push(ms); } });
    await countSwc({ q: '"x"' }, ctx, { fetch: f, apiKey: "k", sleep: async (ms) => { sleeps.push(ms); } });
    expect(sleeps.length).toBeGreaterThan(0);
    expect(sleeps.every((ms) => ms > 0 && ms <= 2000)).toBe(true);
  });
});
