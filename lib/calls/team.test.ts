import { describe, expect, it } from "vitest";
import { aggregateTeam, formatRate, parseTeamPeriod, type TeamCall } from "./team";

const call = (overrides: Partial<TeamCall>): TeamCall => ({
  recordId: "r1",
  userId: "anna",
  userEmail: "anna@effektivmedia.nu",
  outcome: "no_answer",
  profileId: "conseo",
  ...overrides,
});

describe("aggregateTeam", () => {
  const stats = aggregateTeam([
    call({ recordId: "r1", outcome: "no_answer" }),
    call({ recordId: "r1", outcome: "meeting_booked" }),
    call({ recordId: "r2", outcome: "wrong_number" }),
    call({ recordId: "r3", userId: "erik", userEmail: "erik@effektivmedia.nu", outcome: "not_interested", profileId: "eniro" }),
    call({ recordId: "r4", userId: "erik", userEmail: "erik@effektivmedia.nu", outcome: "customer", profileId: null }),
  ]);

  it("counts companies once, however many times they were called", () => {
    expect(stats.total).toEqual({ calls: 5, companies: 4, reached: 3, meetings: 1, customers: 1 });
  });

  it("counts a call as reached unless nobody answered or the number was wrong", () => {
    expect(stats.sellers.find((s) => s.userId === "anna")).toMatchObject({ calls: 3, reached: 1 });
    expect(stats.sellers.find((s) => s.userId === "erik")).toMatchObject({ calls: 2, reached: 2 });
  });

  it("puts the most meetings first", () => {
    expect(stats.sellers.map((s) => s.userId)).toEqual(["anna", "erik"]);
    expect(stats.sources.map((s) => s.profileId)).toEqual(["conseo", "eniro"]);
  });

  it("leaves a call whose record has no profile out of the sources, not out of the total", () => {
    expect(stats.sources.reduce((sum, s) => sum + s.calls, 0)).toBe(4);
  });
});

describe("formatRate", () => {
  it("rounds to whole percent and dashes an empty denominator", () => {
    expect(formatRate(1, 3)).toBe("33 %");
    expect(formatRate(0, 0)).toBe("–");
  });
});

describe("parseTeamPeriod", () => {
  it("accepts the offered periods and falls back to 30", () => {
    expect(parseTeamPeriod("7")).toBe(7);
    expect(parseTeamPeriod("90")).toBe(90);
    expect(parseTeamPeriod("365")).toBe(30);
    expect(parseTeamPeriod(undefined)).toBe(30);
  });
});
