import { describe, expect, it } from "vitest";
import { dialerHref, queueSeed } from "./scope";

describe("queueSeed", () => {
  it("is the same all Swedish day and different the next", () => {
    const morning = queueSeed("u1", new Date("2026-10-05T05:30:00Z")); // 07:30 i Stockholm
    const evening = queueSeed("u1", new Date("2026-10-05T21:30:00Z")); // 23:30
    const nextDay = queueSeed("u1", new Date("2026-10-05T22:30:00Z")); // 00:30 dagen efter
    expect(morning).toBe(evening);
    expect(nextDay).not.toBe(morning);
  });

  it("differs between sellers", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    expect(queueSeed("u1", now)).not.toBe(queueSeed("u2", now));
  });
});

describe("dialerHref", () => {
  it("only writes what differs from the default", () => {
    expect(dialerHref({ profileSlug: null, mode: "new" })).toBe("/app/ring");
    expect(dialerHref({ profileSlug: "eniro", mode: "new", outdatedOnly: true })).toBe("/app/ring?supplier=eniro&site=outdated");
    expect(dialerHref({ profileSlug: "roi", mode: "callbacks" }, ["a", "b"])).toBe("/app/ring?supplier=roi&queue=callbacks&skip=a%2Cb");
  });
});
