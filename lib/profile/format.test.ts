import { describe, expect, it } from "vitest";
import { compactKr, ratioPercent, changePercent, shortDate, titleCasePlace, yearsSince } from "./format";

describe("compactKr", () => {
  it("writes millions, thousands and billions the Swedish way", () => {
    expect(compactKr(9_659_000)).toBe("9,7 Mkr");
    expect(compactKr(235_552)).toBe("236 tkr");
    expect(compactKr(1_250_000_000)).toBe("1,3 Mdkr");
    expect(compactKr(999)).toBe("999 kr");
    expect(compactKr(10_000_000)).toBe("10 Mkr");
  });
  it("handles a loss and nothing", () => {
    expect(compactKr(-1_500_000)).toBe("\u22121,5 Mkr"); // svenskt minustecken, inte ett tankstreck
    expect(compactKr(0)).toBe("0 kr");
    expect(compactKr(null)).toBeNull();
    expect(compactKr(undefined)).toBeNull();
    expect(compactKr(NaN)).toBeNull();
  });
});

describe("yearsSince", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  it("counts whole years", () => {
    expect(yearsSince("2019-04-30", now)).toBe(7);
    expect(yearsSince("2019-10-12", now)).toBe(7);
    expect(yearsSince("2019-10-13", now)).toBe(6);
    expect(yearsSince("2026-12-01", now)).toBe(0);
  });
  it("gives null for no or a bad date", () => {
    expect(yearsSince(null, now)).toBeNull();
    expect(yearsSince("inte ett datum", now)).toBeNull();
  });
});

describe("ratioPercent", () => {
  it("rounds, and gives null without a base", () => {
    expect(ratioPercent(235_552, 9_659_000)).toBe(2);
    expect(ratioPercent(914_498, 2_624_267)).toBe(35);
    expect(ratioPercent(5, 0)).toBeNull();
    expect(ratioPercent(null, 100)).toBeNull();
    expect(ratioPercent(1, null)).toBeNull();
  });
});

describe("shortDate", () => {
  it("writes a short Swedish date, and null for nothing", () => {
    expect(shortDate("2026-10-05T10:00:00.000Z")).toMatch(/5 okt\.? 2026/);
    expect(shortDate(null)).toBeNull();
    expect(shortDate("fel")).toBeNull();
  });
});

describe("titleCasePlace", () => {
  it("lowercases shouting place names and leaves mixed case alone", () => {
    expect(titleCasePlace("HENÅN")).toBe("Henån");
    expect(titleCasePlace("UPPLANDS-VÄSBY")).toBe("Upplands-Väsby");
    expect(titleCasePlace("Storgatan 1, 473 31 HENÅN")).toBe("Storgatan 1, 473 31 Henån");
    expect(titleCasePlace(null)).toBeNull();
  });
});

describe("changePercent", () => {
  it("gives the change against the year before, and null without a base", () => {
    expect(changePercent(112, 100)).toBe(12);
    expect(changePercent(80, 100)).toBe(-20);
    expect(changePercent(-50, -100)).toBe(50);
    expect(changePercent(10, 0)).toBeNull();
    expect(changePercent(null, 100)).toBeNull();
  });
});
