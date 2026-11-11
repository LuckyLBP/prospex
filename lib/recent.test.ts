import { describe, expect, it } from "vitest";
import { recentTitle } from "./recent";

describe("recentTitle", () => {
  it("is null when nothing is new, so the label stays hidden", () => {
    expect(recentTitle(0)).toBeNull();
    expect(recentTitle(null)).toBeNull();
    expect(recentTitle(undefined)).toBeNull();
  });
  it("counts the new companies and says for how long", () => {
    expect(recentTitle(1)).toBe("1 nytt företag de senaste 3 dygnen");
    expect(recentTitle(11)).toBe("11 nya företag de senaste 3 dygnen");
  });
});

import { isRecent, newCompanyTitle } from "./recent";

describe("isRecent", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  it("is true for a company added within the window and false after it", () => {
    expect(isRecent("2026-11-11T04:00:00Z", now)).toBe(true);
    expect(isRecent("2026-11-09T13:00:00Z", now)).toBe(true);
    expect(isRecent("2026-11-08T11:00:00Z", now)).toBe(false);
  });
  it("is false without a date or with one in the far future", () => {
    expect(isRecent(null, now)).toBe(false);
    expect(isRecent(undefined, now)).toBe(false);
    expect(isRecent("2026-12-25T00:00:00Z", now)).toBe(false);
  });
});

describe("newCompanyTitle", () => {
  it("names the supplier and the day it was added", () => {
    expect(newCompanyTitle("Servicefinder", "2026-11-11T04:00:00Z")).toBe("Nytt hos Servicefinder, tillagt 11 nov.");
  });
});
