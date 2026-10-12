import { describe, expect, it } from "vitest";
import { createDomainlistCollector, parseDomains } from "./domainlist";
import { CollectorError } from "./types";
import type { CollectBatch, CollectContext } from "./types";

function ctx(cursor: CollectContext["cursor"] = null): CollectContext {
  return {
    profile: {} as CollectContext["profile"],
    runId: "run-1",
    cursor,
    signal: new AbortController().signal,
    log: () => {},
  };
}

async function drain(generator: AsyncGenerator<CollectBatch>): Promise<CollectBatch[]> {
  const batches: CollectBatch[] = [];
  for await (const batch of generator) batches.push(batch);
  return batches;
}

describe("parseDomains", () => {
  it("normalises every line and drops the rest", () => {
    expect(
      parseDomains("https://WWW.Salong.se/boka\nklinik.se\n-\nrubrik\ninfo@firma.se"),
    ).toEqual(["salong.se", "klinik.se"]);
  });

  it("treats a domain seen twice as one", () => {
    expect(parseDomains("salong.se\nhttps://www.salong.se/")).toEqual(["salong.se"]);
  });

  it("splits a pasted spreadsheet column however it separates its rows", () => {
    expect(parseDomains("a.se, b.se;\tc.se")).toEqual(["a.se", "b.se", "c.se"]);
  });
});

describe("createDomainlistCollector", () => {
  it("yields the domains as items and ends with a null cursor", async () => {
    const collector = createDomainlistCollector();
    const batches = await drain(collector.collect({ domains: "a.se\nb.se" }, ctx()));

    expect(batches).toHaveLength(1);
    expect(batches[0].items.map((item) => item.dedupeKey)).toEqual(["a.se", "b.se"]);
    expect(batches[0].items[0].website).toBe("https://a.se");
    expect(batches[0].cursor).toBeNull();
  });

  it("pages, and resumes from the cursor it left behind", async () => {
    const domains = Array.from({ length: 501 }, (_, index) => `firma${index}.se`).join("\n");
    const collector = createDomainlistCollector();

    const first = await drain(collector.collect({ domains }, ctx()));
    expect(first[0].items).toHaveLength(500);
    expect(first[0].cursor).toEqual({ offset: 500 });
    expect(first[1].items).toHaveLength(1);
    expect(first[1].cursor).toBeNull();

    const resumed = await drain(collector.collect({ domains }, ctx({ offset: 500 })));
    expect(resumed).toHaveLength(1);
    expect(resumed[0].items.map((item) => item.dedupeKey)).toEqual(["firma500.se"]);
  });

  it("says so when nothing in the list was a domain", async () => {
    const collector = createDomainlistCollector();
    await expect(drain(collector.collect({ domains: "rubrik\n-" }, ctx()))).rejects.toThrow(
      /gick att läsa som en domän/,
    );
  });

  it("refuses a config the schema no longer accepts", () => {
    const collector = createDomainlistCollector();
    expect(() => collector.parseConfig({ domains: "" })).toThrow(CollectorError);
  });
});
