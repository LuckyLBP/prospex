import { describe, expect, it, vi } from "vitest";
import { createGoogleplacesCollector, parseLines, toItem } from "./googleplaces";
import type { CollectContext } from "./types";

// Places answers with a nested shape and a page token. The mapping to a
// record, the dedupe key and the cursor are what decide whether a re-run is an
// update and whether a run that stops halfway resumes in the right place.

const config = { queries: "redovisningsbyrå", locations: "Göteborg\nMalmö", maxPages: 2 };

function ctx(cursor: unknown = null): CollectContext {
  return {
    profile: {} as CollectContext["profile"],
    runId: "run",
    cursor: cursor as CollectContext["cursor"],
    signal: new AbortController().signal,
    log: () => {},
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function drain(gen: AsyncGenerator<{ items: unknown[]; cursor: unknown }>) {
  const batches: { items: unknown[]; cursor: unknown }[] = [];
  for await (const batch of gen) batches.push(batch);
  return batches;
}

describe("parseLines", () => {
  it("trims, drops blanks and removes duplicates", () => {
    expect(parseLines(" Malmö \n\nMalmö\r\nLund")).toEqual(["Malmö", "Lund"]);
  });
});

describe("toItem", () => {
  it("keys on the website domain and normalises the phone", () => {
    const item = toItem(
      {
        id: "p1",
        displayName: { text: "Keeper AB" },
        websiteUri: "https://keeperab.se/?utm_source=google",
        internationalPhoneNumber: "+46 8 792 45 00",
        googleMapsUri: "https://maps.google.com/?cid=1",
      },
      "redovisningsbyrå",
      "Stockholm",
    );
    expect(item).toMatchObject({
      dedupeKey: "keeperab.se",
      domain: "keeperab.se",
      website: "https://keeperab.se",
      companyName: "Keeper AB",
      phone: "+4687924500",
      sourceUrl: "https://maps.google.com/?cid=1",
    });
  });

  it("falls back to the place id when there is no website", () => {
    const item = toItem({ id: "p2", displayName: { text: "Zeito" } }, "q", "l");
    expect(item).toMatchObject({ dedupeKey: "googleplaces:p2", domain: null, website: null });
  });

  it("skips permanently closed places and rows without an id", () => {
    expect(toItem({ id: "p3", businessStatus: "CLOSED_PERMANENTLY" }, "q", "l")).toBeNull();
    expect(toItem({ displayName: { text: "x" } }, "q", "l")).toBeNull();
  });
});

describe("collect", () => {
  it("refuses to run without an API key", async () => {
    const collector = createGoogleplacesCollector({ fetch: vi.fn(), apiKey: undefined });
    await expect(drain(collector.collect(config, ctx()))).rejects.toThrow("GOOGLE_PLACES_API_KEY");
  });

  it("follows the page token, then moves on to the next place", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ places: [{ id: "a" }], nextPageToken: "t1" }))
      .mockResolvedValueOnce(jsonResponse({ places: [{ id: "b" }], nextPageToken: "t2" }))
      .mockResolvedValueOnce(jsonResponse({ places: [{ id: "c" }] }));
    const collector = createGoogleplacesCollector({ fetch, apiKey: "key" });

    const batches = await drain(collector.collect({ ...config, maxPages: 2 }, ctx()));

    // Göteborg page 1 (token), Göteborg page 2 (capped by maxPages, so on to
    // Malmö), Malmö page 1 (no token: the last pair, so the run is done).
    expect(batches.map((b) => b.cursor)).toEqual([
      { pair: 0, pageToken: "t1", page: 2 },
      { pair: 1, pageToken: null, page: 1 },
      null,
    ]);
    const second = JSON.parse(fetch.mock.calls[1][1].body as string);
    expect(second).toMatchObject({ textQuery: "redovisningsbyrå i Göteborg", pageToken: "t1" });
    const third = JSON.parse(fetch.mock.calls[2][1].body as string);
    expect(third.textQuery).toBe("redovisningsbyrå i Malmö");
    expect(third.pageToken).toBeUndefined();
  });

  it("resumes from the cursor it was given", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ places: [{ id: "z" }] }));
    const collector = createGoogleplacesCollector({ fetch, apiKey: "key" });

    const batches = await drain(collector.collect(config, ctx({ pair: 1, pageToken: null, page: 1 })));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body as string).textQuery).toBe("redovisningsbyrå i Malmö");
    expect(batches).toHaveLength(1);
  });

  it("explains a rejected key", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "API key not valid", status: "INVALID_ARGUMENT" } }, 400));
    const collector = createGoogleplacesCollector({ fetch, apiKey: "bad" });
    await expect(drain(collector.collect(config, ctx()))).rejects.toThrow("Places API (New)");
  });
});
