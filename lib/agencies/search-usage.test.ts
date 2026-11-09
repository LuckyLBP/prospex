import { describe, expect, it } from "vitest";
import { usageKey } from "./search-usage";

describe("usageKey", () => {
  it("gives each calendar month its own counter, so a new month starts at zero", () => {
    expect(usageKey(new Date("2026-11-09T12:00:00Z"))).toBe("brave:2026-11");
    expect(usageKey(new Date("2026-12-01T00:00:00Z"))).toBe("brave:2026-12");
    expect(usageKey(new Date("2026-11-30T23:59:59Z"))).not.toBe(usageKey(new Date("2026-12-01T00:00:00Z")));
  });
});
