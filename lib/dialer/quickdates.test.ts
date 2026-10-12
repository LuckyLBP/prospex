import { describe, expect, it } from "vitest";
import { defaultMeeting, quickCallbackDates } from "./quickdates";

describe("quickCallbackDates", () => {
  it("gives tomorrow, in two days and next Monday (a Wednesday)", () => {
    const q = quickCallbackDates(new Date("2026-10-07T10:00:00Z")); // onsdag
    expect(q.map((x) => x.date)).toEqual(["2026-10-08", "2026-10-09", "2026-10-12"]);
    expect(q.map((x) => x.label)).toEqual(["Imorgon", "Om 2 dagar", "Nästa vecka"]);
  });
  it("never repeats a day: on a Sunday next week starts the Monday after tomorrow", () => {
    const q = quickCallbackDates(new Date("2026-10-11T10:00:00Z")); // söndag, imorgon är måndag
    expect(q.map((x) => x.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-19"]);
  });
  it("uses the Swedish date, so 23:30 UTC in summer is already tomorrow", () => {
    const q = quickCallbackDates(new Date("2026-07-01T22:30:00Z")); // 00:30 den 2 juli i Stockholm
    expect(q[0].date).toBe("2026-07-03");
  });
  it("keeps the date right across the autumn clock change", () => {
    const q = quickCallbackDates(new Date("2026-10-24T12:00:00Z")); // lördag före sommartidens slut
    // Nästa måndag (26 okt) är redan "Om 2 dagar", så "Nästa vecka" blir måndagen efter.
    expect(q.map((x) => x.date)).toEqual(["2026-10-25", "2026-10-26", "2026-11-02"]);
  });
});

describe("defaultMeeting", () => {
  it("is tomorrow at ten in local time", () => {
    expect(defaultMeeting(new Date("2026-10-07T10:00:00Z"))).toBe("2026-10-08T10:00");
  });
});
