import { describe, expect, it } from "vitest";
import { findOrgNumber, isValidOrgNumber, normalizeOrgNumber } from "./orgnr";

describe("isValidOrgNumber", () => {
  it("accepts both written forms of a valid number", () => {
    expect(isValidOrgNumber("556677-8899")).toBe(true);
    expect(isValidOrgNumber("5566778899")).toBe(true);
    expect(normalizeOrgNumber("5566778899")).toBe("556677-8899");
  });

  it("rejects a wrong check digit", () => {
    expect(isValidOrgNumber("556677-8898")).toBe(false);
  });
});

describe("findOrgNumber", () => {
  it("finds a labelled number in a footer", () => {
    expect(findOrgNumber("Salong AB · Org.nr 556677-8899 · Stockholm")).toBe("556677-8899");
    expect(findOrgNumber("Organisationsnummer: 5566778899")).toBe("556677-8899");
  });

  it("takes a single unlabelled number that survives both structural filters", () => {
    expect(findOrgNumber("Vi är registrerade som 556677-8899.")).toBe("556677-8899");
  });

  it("refuses to choose between several unlabelled numbers", () => {
    // Both are Luhn-valid org-shaped numbers with no keyword in sight.
    expect(findOrgNumber("Referens 556677-8899 och 556036-0793 i samma stycke.")).toBeNull();
  });

  it("picks the labelled one when unlabelled numbers are also present", () => {
    const text = "Bankgiro 556036-0793. Org.nr 556677-8899.";
    expect(findOrgNumber(text)).toBe("556677-8899");
  });

  it("never takes a phone number, even a Luhn-valid one", () => {
    expect(findOrgNumber("511 68 Hyssna 0730414760 info@hallahund.se")).toBeNull();
    expect(findOrgNumber("Food KAM +4642178141 mattias@example.se")).toBeNull();
  });

  it("never takes a placeholder number", () => {
    expect(findOrgNumber("Org.nr 999999-9999")).toBeNull();
  });

  it("never returns a personnummer", () => {
    // Third digit is a month (0-1 leading), so this is a personal identity
    // number even though it is Luhn-valid -- and a sole trader's org number.
    expect(findOrgNumber("Org.nr 850101-2394")).toBeNull();
    expect(findOrgNumber("Innehavare 19850101-2394")).toBeNull();
  });

  it("ignores numbers that only look right", () => {
    expect(findOrgNumber("Telefon 08-123 45 67")).toBeNull();
    expect(findOrgNumber("Datum 2026-09-10")).toBeNull();
    expect(findOrgNumber("Ingen text alls")).toBeNull();
    // Luhn fails.
    expect(findOrgNumber("Org.nr 556677-8898")).toBeNull();
  });
});
