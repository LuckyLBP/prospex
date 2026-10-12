import { describe, expect, it } from "vitest";
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

describe("createPublicwwwCollector", () => {
  const config = { query: '"addictive-media"', maxResults: 10 };

  async function collectAll(collector: ReturnType<typeof createPublicwwwCollector>) {
    const batches = [];
    for await (const batch of collector.collect(config, ctx())) batches.push(batch);
    return batches;
  }

  it("sends the query and the key, and reads the results", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const collector = createPublicwwwCollector({
      apiKey: "secret",
      fetch: async (url, init) => {
        seenUrl = String(url);
        seenAuth = String(new Headers(init?.headers).get("authorization"));
        return new Response(JSON.stringify({ results: [{ domain: "a.se" }] }), { status: 200 });
      },
    });

    const batches = await collectAll(collector);
    expect(seenUrl).toContain("query=%22addictive-media%22");
    expect(seenUrl).toContain("per_page=10");
    expect(seenAuth).toBe("Bearer secret");
    expect(batches[0].items[0].domain).toBe("a.se");
  });

  it("waits out a burst answer and asks again", async () => {
    const waits: number[] = [];
    let calls = 0;
    const collector = createPublicwwwCollector({
      apiKey: "secret",
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetch: async () =>
        ++calls === 1
          ? new Response(JSON.stringify({ error: { code: "too_many_requests", retry_after: 12 } }), {
              status: 429,
            })
          : new Response(JSON.stringify({ results: [{ domain: "a.se" }] }), { status: 200 }),
    });

    const batches = await collectAll(collector);
    expect(calls).toBe(2);
    expect(waits).toEqual([13_000]);
    expect(batches[0].items[0].domain).toBe("a.se");
  });

  it("turns a rate-limit answer that never clears into a message a user can act on", async () => {
    const collector = createPublicwwwCollector({
      apiKey: "secret",
      sleep: async () => {},
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { code: "too_many_requests", retry_after: 18 } }),
          { status: 429 },
        ),
    });
    await expect(collectAll(collector)).rejects.toThrow(CollectorError);
    await expect(collectAll(collector)).rejects.toThrow(/18 sekunder/);
  });

  it("distinguishes an exhausted quota from a burst", async () => {
    const collector = createPublicwwwCollector({
      apiKey: "secret",
      fetch: async () =>
        new Response(JSON.stringify({ error: { code: "quota_exceeded" } }), { status: 429 }),
    });
    await expect(collectAll(collector)).rejects.toThrow(/kvoten är slut/);
  });

  it("reads a 403 plan_required as the plan's own ceiling", async () => {
    const collector = createPublicwwwCollector({
      apiKey: "secret",
      fetch: async () =>
        new Response(JSON.stringify({ error: { code: "plan_required", plan: "pro_month" } }), {
          status: 403,
        }),
    });
    await expect(collectAll(collector)).rejects.toThrow(/planen? räcker inte|plan räcker inte/);
  });

  it("explains an HTML login page instead of leaking a parser error", async () => {
    const collector = createPublicwwwCollector({
      apiKey: "bad",
      fetch: async () => new Response("<!doctype html><html>Sign in", { status: 200 }),
    });
    await expect(collectAll(collector)).rejects.toThrow(/Kontrollera API-nyckeln/);
  });

  it("refuses to run without a key rather than calling the API", async () => {
    const collector = createPublicwwwCollector({
      apiKey: undefined,
      fetch: async () => {
        throw new Error("should not be called");
      },
    });
    await expect(collectAll(collector)).rejects.toThrow(/PUBLICWWW_API_KEY/);
  });
});
