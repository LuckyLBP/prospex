import { describe, expect, it } from "vitest";
import { formatSwedishPhone, normalizeSwedishPhone } from "./phone";

describe("normalizeSwedishPhone", () => {
  it("stores the same number written six ways as one value", () => {
    const forms = [
      "08-123 45 67",
      "08 123 45 67",
      "+46 8 123 45 67",
      "+46 (0)8-1234567",
      "0046 8 123 45 67",
      "081234567",
    ];
    const normalised = new Set(forms.map(normalizeSwedishPhone));
    expect(normalised).toEqual(new Set(["+4681234567"]));
  });

  it("normalises mobile numbers", () => {
    expect(normalizeSwedishPhone("070-123 45 67")).toBe("+46701234567");
    expect(normalizeSwedishPhone("+46701234567")).toBe("+46701234567");
  });

  it("leaves non-Swedish numbers alone rather than mangling them", () => {
    expect(normalizeSwedishPhone("+45 33 12 34 56")).toBeNull();
    expect(normalizeSwedishPhone("+1 415 555 0100")).toBeNull();
  });

  it("rejects things that are not phone numbers", () => {
    expect(normalizeSwedishPhone(null)).toBeNull();
    expect(normalizeSwedishPhone("")).toBeNull();
    expect(normalizeSwedishPhone("abc")).toBeNull();
    expect(normalizeSwedishPhone("123")).toBeNull();
    expect(normalizeSwedishPhone("08-123 45 67 89 01")).toBeNull();
  });

  it("does not read an org number as a phone number", () => {
    expect(normalizeSwedishPhone("556677-8899")).toBeNull();
  });
});

describe("formatSwedishPhone", () => {
  it("shows a stored number in Swedish notation", () => {
    expect(formatSwedishPhone("+46701234567")).toBe("070-123 45 67");
    expect(formatSwedishPhone("+4681234567")).toBe("08-123 45 67");
  });

  it("passes through what it cannot format", () => {
    expect(formatSwedishPhone(null)).toBeNull();
    expect(formatSwedishPhone("+4533123456")).toBe("+4533123456");
  });
});
