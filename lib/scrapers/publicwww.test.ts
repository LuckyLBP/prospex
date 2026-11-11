import { describe, expect, it, vi } from "vitest";
import { createPublicwwwCollector, itemsFromResponse } from "./publicwww";
import { CollectorError } from "./types";
import type { CollectContext } from "./types";

function ctx(): CollectContext {
  return {
    profile: {} as CollectContext["profile"],
    runId: "run-1",
    cursor: null,
    signal: new AbortController().signal,
    log: () => {},
  };
}

describe("itemsFromResponse", () => {
  it("normalises each result to a domain item", () => {
    const batch = itemsFromResponse({
      results: [
        { domain: "WWW.Salong.se", url: "https://www.salong.se/boka" },
        { domain: "klinik.se", url: "https://klinik.se" },
      ],
    });
    expect(batch.items.map((i) => i.dedupeKey)).toEqual(["salong.se", "klinik.se"]);
    expect(batch.items[0].website).toBe("https://salong.se");
    expect(batch.cursor).toBeNull();
  });

  it("collapses two URLs on the same host into one record", () => {
    const batch = itemsFromResponse({
      results: [
        { domain: "salong.se", url: "https://salong.se/a" },
        { domain: "www.salong.se", url: "https://www.salong.se/b" },
      ],
    });
    expect(batch.items).toHaveLength(1);
  });

  it("carries the plan's depth cap through as truncated", () => {
    expect(itemsFromResponse({ results: [], truncated: true }).truncated).toBe(true);
    expect(itemsFromResponse({ results: [] }).truncated).toBe(false);
  });
});

describe("createPublicwwwCollector (source code search through SearchWebCode)", () => {
  const config = { query: '"addictive-media"', maxResults: 10 };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const swc = (f: typeof fetch) => ({ fetch: f, apiKey: "swc_live_x", sleep: async () => {} });

  async function collectAll(collector: ReturnType<typeof createPublicwwwCollector>) {
    const batches = [];
    for await (const batch of collector.collect(config, ctx())) batches.push(batch);
    return batches;
  }

  it("runs the query and turns the hits into items, one search per run", async () => {
    const f = vi.fn(async () => json({ total: 2, results: [{ domain: "salong.se", url: "https://salong.se/" }, { domain: "klinik.se", url: "https://klinik.se/" }] })) as unknown as typeof fetch;
    const batches = await collectAll(createPublicwwwCollector({ swc: swc(f), reserve: async () => true }));
    expect(batches).toHaveLength(1);
    expect(batches[0].items.map((i) => i.dedupeKey)).toEqual(["salong.se", "klinik.se"]);
    expect(batches[0].truncated).toBe(false);
  });

  it("reports a missing key and a reached monthly cap in words a user can act on", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    await expect(collectAll(createPublicwwwCollector({ swc: { fetch: f, apiKey: undefined } }))).rejects.toThrow(/SEARCHWEBCODE_API_KEY/);
    await expect(collectAll(createPublicwwwCollector({ swc: swc(f), reserve: async () => false }))).rejects.toThrow(/månadens tak/);
    expect(f).not.toHaveBeenCalled();
  });

  it("surfaces an HTTP failure as a CollectorError", async () => {
    const f = vi.fn(async () => json({ error: "boom" }, 500)) as unknown as typeof fetch;
    await expect(collectAll(createPublicwwwCollector({ swc: swc(f), reserve: async () => true }))).rejects.toThrow(CollectorError);
  });

  it("rejects incomplete settings with a Swedish message", () => {
    expect(() => createPublicwwwCollector().parseConfig({})).toThrow(CollectorError);
  });
});
