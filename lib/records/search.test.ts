import { describe, expect, it } from "vitest";
import { buildSearchNeedle, escapeLike } from "./search";

describe("escapeLike", () => {
  it("escapes LIKE's wildcards so a search means what it looks like", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("escapes the backslash first, so it does not escape its own escapes", () => {
    expect(escapeLike("a\\%b")).toBe("a\\\\\\%b");
  });
});

describe("buildSearchNeedle", () => {
  it("wraps a plain term in wildcards, lowercased to match search_text", () => {
    expect(buildSearchNeedle("Stockholm")).toBe("%stockholm%");
    expect(buildSearchNeedle("  Salong Ada ")).toBe("%salong ada%");
  });

  it("finds a phone number typed the way the page prints it", () => {
    // Stored as +4681234567; a user types what they see.
    expect(buildSearchNeedle("08-123 45 67")).toBe("%+4681234567%");
    expect(buildSearchNeedle("070 123 45 67")).toBe("%+46701234567%");
  });

  it("leaves an org number alone -- it is stored as written", () => {
    expect(buildSearchNeedle("556677-8899")).toBe("%556677-8899%");
  });

  it("returns null for an empty search", () => {
    expect(buildSearchNeedle("")).toBeNull();
    expect(buildSearchNeedle("   ")).toBeNull();
  });

  it("does not treat a short number as a phone number", () => {
    expect(buildSearchNeedle("12")).toBe("%12%");
  });
});
