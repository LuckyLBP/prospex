import { describe, expect, it } from "vitest";
import { placeMenu } from "./menu-place";

const vp = { width: 1200, height: 800 };
const menu = { width: 264, height: 420 };

describe("placeMenu", () => {
  it("opens below the button when there is room", () => {
    expect(placeMenu({ top: 100, bottom: 130, left: 400 }, vp, menu)).toEqual({ left: 400, top: 136 });
  });
  it("opens above the button when it does not fit below and there is more room above", () => {
    expect(placeMenu({ top: 700, bottom: 730, left: 400 }, vp, menu)).toEqual({ left: 400, bottom: 106 });
  });
  it("still opens below when neither side fits but below has more room", () => {
    expect(placeMenu({ top: 150, bottom: 180, left: 400 }, { width: 1200, height: 400 }, menu)).toEqual({ left: 400, top: 186 });
  });
  it("keeps the menu inside the window sideways", () => {
    expect(placeMenu({ top: 100, bottom: 130, left: 1150 }, vp, menu).left).toBe(1200 - 264 - 8);
    expect(placeMenu({ top: 100, bottom: 130, left: -20 }, vp, menu).left).toBe(8);
  });
});
