import { describe, expect, it, vi } from "vitest";
import { codeSourceName, searchCode } from "./codesearch";

const ctx = { signal: new AbortController().signal, log: () => {} };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const swc = (fetchFn: typeof fetch) => ({ fetch: fetchFn, apiKey: "swc_live_x", sleep: async () => {} });
const noSwc = { fetch: vi.fn() as never, apiKey: undefined };

describe("searchCode", () => {
  it("uses SearchWebCode when its key is set, translating the PublicWWW query and keeping the page", async () => {
    const f = vi.fn(async () => json({ total: 2, results: [{ domain: "a.se", url: "https://a.se/" }, { domain: "b.se", url: "https://b.se/" }] })) as unknown as typeof fetch;
    const r = await searchCode('"wp-content/themes/Divi" site:se', 100, ctx, { swc: swc(f), reserve: async () => true });
    expect(r).toMatchObject({ source: "searchwebcode", truncated: false, hits: [{ domain: "a.se", url: "https://a.se/" }, { domain: "b.se", url: "https://b.se/" }] });
    const url = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("tld=se");
    expect(decodeURIComponent(url.replace(/\+/g, " "))).toContain('q=Divi AND "wp-content/themes/Divi"');
  });
  it("falls back to PublicWWW only when there is no SearchWebCode key", async () => {
    const pw = vi.fn(async () => json({ results: [{ domain: "c.se", url: "https://c.se/x" }] })) as unknown as typeof fetch;
    const r = await searchCode('"x"', 10, ctx, { swc: noSwc, publicwww: { fetch: pw, apiKey: "k" } });
    expect(r).toMatchObject({ source: "publicwww", hits: [{ domain: "c.se", url: "https://c.se/x" }] });
  });
  it("stops with a clear message, and sends nothing, when this month's cap is reached", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    await expect(searchCode('"x"', 10, ctx, { swc: swc(f), reserve: async () => false })).rejects.toThrow(/månadens tak/);
    expect(f).not.toHaveBeenCalled();
  });
  it("names the source in use", () => {
    expect(codeSourceName({ fetch: vi.fn() as never, apiKey: "k" })).toBe("SearchWebCode");
    expect(codeSourceName(noSwc)).toBe("PublicWWW");
  });
});
