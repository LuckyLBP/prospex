import { describe, expect, it } from "vitest";
import { missingIds } from "./window";

const ids = Array.from({ length: 30 }, (_, i) => `id${i}`);

describe("missingIds", () => {
  it("asks for what is ahead first, then behind", () => {
    const m = missingIds(ids, 5, new Set(["id5"]));
    expect(m.slice(0, 7)).toEqual(["id6", "id7", "id8", "id9", "id10", "id11", "id12"]);
    expect(m).toContain("id4");
    expect(m).not.toContain("id5");
  });
  it("asks for nothing when the window is already loaded", () => {
    const have = new Set(ids.slice(0, 14));
    expect(missingIds(ids, 5, have)).toEqual([]);
  });
  it("never asks for more than one batch", () => {
    expect(missingIds(ids, 10, new Set()).length).toBe(10);
    expect(missingIds(ids, 10, new Set(), 4).length).toBe(4);
  });
  it("stays inside the queue at both ends", () => {
    expect(missingIds(ids, 0, new Set()).every((x) => ids.includes(x))).toBe(true);
    const end = missingIds(ids, 29, new Set());
    expect(end).toContain("id29");
    expect(end.every((x) => ids.includes(x))).toBe(true);
  });
  it("handles an empty queue", () => {
    expect(missingIds([], 0, new Set())).toEqual([]);
  });
});
