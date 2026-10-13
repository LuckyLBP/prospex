import { describe, expect, it } from "vitest";
import { dialerHref, normalizeScope, parseSources, parseTemplate, queueSeed, sameScope, templateLabel } from "./scope";

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
    expect(dialerHref({ sources: [], mode: "new" })).toBe("/app/ring");
    expect(dialerHref({ sources: ["eniro"], mode: "new", outdatedOnly: true })).toBe("/app/ring?supplier=eniro&site=outdated");
    expect(dialerHref({ sources: ["roi"], mode: "callbacks" }, ["a", "b"])).toBe("/app/ring?supplier=roi&queue=callbacks&skip=a%2Cb");
  });
});

describe("templates", () => {
  it("parses the URL value and ignores anything else", () => {
    expect(parseTemplate("ingen")).toBe("fresh");
    expect(parseTemplate("ejsvar")).toBe("noanswer");
    expect(parseTemplate("x")).toBeUndefined();
    expect(parseTemplate(null)).toBeUndefined();
  });
  it("writes the template and the new-list marker to the address", () => {
    expect(dialerHref({ sources: [], mode: "new", template: "fresh" })).toBe("/app/ring?mall=ingen");
    expect(dialerHref({ sources: ["eniro"], mode: "new", template: "noanswer", city: "Malmö" }, [], { ny: true })).toBe("/app/ring?mall=ejsvar&ny=1&supplier=eniro&city=Malm%C3%B6");
    expect(dialerHref({ sources: [], mode: "new" }, [], { ny: true })).toBe("/app/ring?ny=1");
  });
  it("labels them", () => {
    expect(templateLabel(undefined)).toBe("Allt att ringa");
    expect(templateLabel("fresh")).toBe("Ingen kontaktad");
    expect(templateLabel("noanswer")).toBe("Ej svarade");
  });
});

describe("sameScope", () => {
  const base = { sources: ["eniro"], mode: "new" as const, city: "Malmö" };
  it("ignores case and spaces in the city, and treats a missing flag as off", () => {
    expect(sameScope(base, { ...base, city: " malmö ", outdatedOnly: false })).toBe(true);
  });
  it("differs on source, mode, city, site filter and template", () => {
    for (const other of [{ sources: ["roi"] }, { sources: ["eniro", "roi"] }, { mode: "mine" as const }, { city: "Lund" }, { outdatedOnly: true }, { template: "fresh" as const }]) {
      expect(sameScope(base, { ...base, ...other })).toBe(false);
    }
  });
});

describe("sources", () => {
  it("parses a comma separated list, keeps only valid slugs and removes duplicates", () => {
    expect(parseSources("eniro,roi, Eniro ,bad slug,../x,")).toEqual(["eniro", "roi"]);
    expect(parseSources(null)).toEqual([]);
    expect(parseSources(Array.from({ length: 40 }, (_, i) => `s${i}`).join(",")).length).toBe(20);
  });
  it("writes several sources to the address", () => {
    expect(dialerHref({ sources: ["eniro", "roi"], mode: "new" })).toBe("/app/ring?supplier=eniro%2Croi");
  });
  it("compares sources regardless of order", () => {
    expect(sameScope({ sources: ["a", "b"], mode: "new" }, { sources: ["b", "a"], mode: "new" })).toBe(true);
  });
  it("reads a list saved before several sources existed", () => {
    expect(normalizeScope({ profileSlug: "roi", mode: "new", city: "Lund", template: "fresh" })).toEqual({ sources: ["roi"], mode: "new", outdatedOnly: false, city: "Lund", template: "fresh" });
    expect(normalizeScope({ profileSlug: null, mode: "callbacks" })).toMatchObject({ sources: [], mode: "callbacks" });
    expect(normalizeScope({ sources: ["a", 3, "b"], mode: "new" }).sources).toEqual(["a", "b"]);
  });
});

