import { describe, expect, it } from "vitest";
import { LIMITS, planRelease, rateDecision } from "./limits";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
const L = { ...LIMITS, dailyViews: 10, minuteViews: 4 };

describe("planRelease", () => {
  it("releases everything while there is room, and counts only the new ones", () => {
    const p = planRelease({ requested: ids(3), free: new Set(["c1"]), usedToday: 0, usedMinute: 0 }, L);
    expect(p).toEqual({ allowed: ["c0", "c1", "c2"], counted: ["c0", "c2"], blocked: [], reason: null });
  });
  it("stops at the per-minute limit and says so", () => {
    const p = planRelease({ requested: ids(6), free: new Set(), usedToday: 0, usedMinute: 1 }, L);
    expect(p.allowed).toEqual(["c0", "c1", "c2"]);
    expect(p.blocked).toEqual(["c3", "c4", "c5"]);
    expect(p.reason).toBe("minute");
  });
  it("stops at the daily limit and says so", () => {
    const p = planRelease({ requested: ids(4), free: new Set(), usedToday: 8, usedMinute: 0 }, L);
    expect(p.allowed).toEqual(["c0", "c1"]);
    expect(p.reason).toBe("daily");
  });
  it("still shows companies already seen today, or the company's own contacts, when the limit is reached", () => {
    const p = planRelease({ requested: ["c0", "c1", "c2"], free: new Set(["c0", "c2"]), usedToday: 10, usedMinute: 4 }, L);
    expect(p.allowed).toEqual(["c0", "c2"]);
    expect(p.blocked).toEqual(["c1"]);
    expect(p.counted).toEqual([]);
  });
  it("ignores duplicate ids", () => {
    expect(planRelease({ requested: ["c0", "c0", "c1"], free: new Set(), usedToday: 0, usedMinute: 0 }, L).counted).toEqual(["c0", "c1"]);
  });
});

describe("rateDecision", () => {
  it("allows up to the limit and then asks to wait", () => {
    expect(rateDecision("search", LIMITS.searchPerMinute - 1)).toEqual({ ok: true });
    expect(rateDecision("search", LIMITS.searchPerMinute)).toEqual({ ok: false, retryAfterSec: 60 });
    expect(rateDecision("list", LIMITS.listPerMinute)).toEqual({ ok: false, retryAfterSec: 60 });
  });
});
