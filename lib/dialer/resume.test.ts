import { describe, expect, it } from "vitest";
import { resumeList } from "./resume";

const saved = ["a", "b", "c", "d", "e"];
const all = new Set(saved);

describe("resumeList", () => {
  it("continues at the company the caller was on", () => {
    expect(resumeList(saved, "c", all)).toEqual({ ids: saved, startIndex: 2 });
  });
  it("drops companies that can no longer be called, keeping the saved order", () => {
    expect(resumeList(saved, "c", new Set(["a", "c", "e"]))).toEqual({ ids: ["a", "c", "e"], startIndex: 1 });
  });
  it("moves on to the next remaining company when the one the caller was on has been called", () => {
    expect(resumeList(saved, "c", new Set(["a", "b", "d", "e"]))).toEqual({ ids: ["a", "b", "d", "e"], startIndex: 2 });
  });
  it("starts at the top when nothing was saved, or the saved company is not in the list", () => {
    expect(resumeList(saved, null, all).startIndex).toBe(0);
    expect(resumeList(saved, "zzz", all).startIndex).toBe(0);
  });
  it("says the list is finished when nothing is left after the caller's place", () => {
    expect(resumeList(saved, "e", new Set(["a", "b"]))).toEqual({ ids: ["a", "b"], startIndex: 2 });
    expect(resumeList(saved, "a", new Set())).toEqual({ ids: [], startIndex: 0 });
  });
});
