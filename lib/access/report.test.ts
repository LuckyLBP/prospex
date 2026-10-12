import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits";
import { accessLevel } from "./report";

describe("accessLevel", () => {
  it("flags from 80 percent of the daily limit and marks the limit as reached", () => {
    expect(accessLevel(0)).toBe("ok");
    expect(accessLevel(LIMITS.dailyViews * 0.8 - 1)).toBe("ok");
    expect(accessLevel(LIMITS.dailyViews * 0.8)).toBe("near");
    expect(accessLevel(LIMITS.dailyViews)).toBe("reached");
  });
});
