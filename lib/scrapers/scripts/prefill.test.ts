import { describe, expect, it } from "vitest";
import { shouldSkipEnrichment } from "./prefill";

describe("shouldSkipEnrichment", () => {
  it("skips a row with nothing to visit", () => {
    expect(shouldSkipEnrichment({ domain: null, email: null, phone: null })).toBe(true);
  });

  it("skips a row that is already complete", () => {
    expect(
      shouldSkipEnrichment({ domain: "salong.se", email: "a@salong.se", phone: "+4681234567" }),
    ).toBe(true);
  });

  it("keeps a row whose missing half only a visit can supply", () => {
    // An Eniro row: name and phone, never an email, but it has a website.
    expect(shouldSkipEnrichment({ domain: "salong.se", email: null, phone: "+4681234567" })).toBe(
      false,
    );
    expect(shouldSkipEnrichment({ domain: "salong.se", email: "a@salong.se", phone: null })).toBe(
      false,
    );
  });
});
