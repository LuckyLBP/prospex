import { describe, expect, it, vi } from "vitest";
import { isCodeSearchConfigured, searchCode } from "./codesearch";

const ctx = { signal: new AbortController().signal, log: () => {} };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const swc = (fetchFn: typeof fetch) => ({ fetch: fetchFn, apiKey: "swc_live_x", sleep: async () => {} });

describe("searchCode", () => {
  it("searches SearchWebCode, translating the phrase query and keeping each page", async () => {
    const f = vi.fn(async () => json({ total: 2, results: [{ domain: "a.se", url: "https://a.se/" }, { domain: "b.se", url: "https://b.se/" }] })) as unknown as typeof fetch;
    const r = await searchCode('"wp-content/themes/Divi" site:se', 100, ctx, { swc: swc(f), reserve: async () => true });
    expect(r).toMatchObject({ truncated: false, hits: [{ domain: "a.se", url: "https://a.se/" }, { domain: "b.se", url: "https://b.se/" }] });
    const url = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("tld=se");
    expect(decodeURIComponent(url.replace(/\+/g, " "))).toContain('q=Divi AND "wp-content/themes/Divi"');
  });
  it("says the key is missing when it is, without calling out", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    await expect(searchCode('"x"', 10, ctx, { swc: { fetch: f, apiKey: undefined } })).rejects.toThrow(/SEARCHWEBCODE_API_KEY/);
    expect(f).not.toHaveBeenCalled();
  });
  it("stops with a clear message, and sends nothing, when this month's cap is reached", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    await expect(searchCode('"x"', 10, ctx, { swc: swc(f), reserve: async () => false })).rejects.toThrow(/månadens tak/);
    expect(f).not.toHaveBeenCalled();
  });
  it("knows whether the key is configured", () => {
    expect(isCodeSearchConfigured({ fetch: vi.fn() as never, apiKey: "k" })).toBe(true);
    expect(isCodeSearchConfigured({ fetch: vi.fn() as never, apiKey: undefined })).toBe(false);
  });
});
