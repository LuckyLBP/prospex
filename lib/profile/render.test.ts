import { describe, expect, it } from "vitest";
import { isClientRendered } from "./render";

describe("isClientRendered", () => {
  it("sees an empty single-page-app shell", () => {
    const html = `<!doctype html><html><head><script type="module" src="/assets/index-B5J8AQhd.js"></script></head><body><div id="root"></div></body></html>`;
    expect(isClientRendered(html)).toBe(true);
  });
  it("does not flag a page with real text", () => {
    const text = "Vi målar och tapetserar i Norrköping sedan 2008. ".repeat(6);
    expect(isClientRendered(`<html><body><main><p>${text}</p></main><script src="/a.js"></script></body></html>`)).toBe(false);
  });
  it("does not flag missing html", () => {
    expect(isClientRendered(null)).toBe(false);
  });
});
