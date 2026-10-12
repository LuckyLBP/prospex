import { describe, expect, it } from "vitest";
import { bucketByDay } from "./week";

describe("bucketByDay", () => {
  const now = new Date("2026-09-16T08:00:00Z"); // onsdag 10:00 i Stockholm

  it("returns seven days ending today, oldest first", () => {
    const week = bucketByDay([], now);
    expect(week.map((d) => d.day)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
    expect(week.map((d) => d.weekday)).toEqual(["Tor", "Fre", "Lör", "Sön", "Mån", "Tis", "Ons"]);
    expect(week.filter((d) => d.isToday).map((d) => d.day)).toEqual(["2026-09-16"]);
  });

  it("buckets by Stockholm's date, not UTC's", () => {
    // 23:30 UTC on the 15th is 01:30 on the 16th in Stockholm.
    const week = bucketByDay(["2026-09-15T23:30:00Z", "2026-09-15T21:30:00Z"], now);
    expect(week.find((d) => d.day === "2026-09-16")?.count).toBe(1);
    expect(week.find((d) => d.day === "2026-09-15")?.count).toBe(1);
  });

  it("ignores calls outside the window", () => {
    const week = bucketByDay(["2026-09-01T10:00:00Z"], now);
    expect(week.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });

  it("keeps every date across the spring DST switch", () => {
    // 2026-03-29 is 23 hours long in Stockholm.
    const week = bucketByDay([], new Date("2026-03-30T22:30:00Z"));
    expect(week.map((d) => d.day)).toEqual([
      "2026-03-25",
      "2026-03-26",
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
    ]);
  });
});
