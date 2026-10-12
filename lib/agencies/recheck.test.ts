import { describe, expect, it } from "vitest";
import { afterRecheck, MISSES_BEFORE_LOST, NO_CREDIT_RETRY_MS, recentlyChecked, UNREADABLE_RETRY_MS } from "./recheck";

const NOW = Date.parse("2026-10-12T10:00:00Z");
const row = (verdict: string, agoMs: number) => ({ verdict, misses: 0, checkedAt: new Date(NOW - agoMs) });

describe("recentlyChecked", () => {
  it("skips a domain without credit for 30 days, and an unreadable one for 7", () => {
    expect(recentlyChecked(row("no-credit", NO_CREDIT_RETRY_MS - 1000), NOW)).toBe(true);
    expect(recentlyChecked(row("no-credit", NO_CREDIT_RETRY_MS + 1000), NOW)).toBe(false);
    expect(recentlyChecked(row("other-agency", 10 * 86_400_000), NOW)).toBe(true);
    expect(recentlyChecked(row("blocked", UNREADABLE_RETRY_MS - 1000), NOW)).toBe(true);
    expect(recentlyChecked(row("unreachable", UNREADABLE_RETRY_MS + 1000), NOW)).toBe(false);
  });
  it("never skips a domain that was never checked", () => {
    expect(recentlyChecked(undefined, NOW)).toBe(false);
  });
});

describe("afterRecheck", () => {
  it("resets on a credit, counts a miss, and calls a customer lost only after enough misses in a row", () => {
    expect(afterRecheck("accepted", 1)).toEqual({ misses: 0, lost: false });
    expect(afterRecheck("no-credit", 0)).toEqual({ misses: 1, lost: false });
    expect(afterRecheck("no-credit", MISSES_BEFORE_LOST - 1)).toEqual({ misses: MISSES_BEFORE_LOST, lost: true });
    expect(afterRecheck("other-agency", 1)).toEqual({ misses: 2, lost: true });
  });
  it("changes nothing for a site that could not be read", () => {
    expect(afterRecheck("blocked", 1)).toEqual({ misses: 1, lost: false });
    expect(afterRecheck("unreachable", 0)).toEqual({ misses: 0, lost: false });
  });
});
