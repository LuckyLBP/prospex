import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internalSecretMatches } from "./internal-secret";

beforeEach(() => vi.stubEnv("INTERNAL_RUN_SECRET", "hemlig-nyckel"));
afterEach(() => vi.unstubAllEnvs());

describe("internalSecretMatches", () => {
  it("accepts the exact secret", () => {
    expect(internalSecretMatches("hemlig-nyckel")).toBe(true);
  });
  it("rejects a wrong secret of the same or a different length, and a missing one", () => {
    expect(internalSecretMatches("hemlig-nyckeX")).toBe(false);
    expect(internalSecretMatches("hemlig")).toBe(false);
    expect(internalSecretMatches("hemlig-nyckel-och-mer")).toBe(false);
    expect(internalSecretMatches(null)).toBe(false);
    expect(internalSecretMatches("")).toBe(false);
  });
  it("accepts nothing when no secret is configured, not even an empty one", () => {
    vi.stubEnv("INTERNAL_RUN_SECRET", "");
    expect(internalSecretMatches("")).toBe(false);
    expect(internalSecretMatches("x")).toBe(false);
  });
});
