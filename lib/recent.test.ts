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
