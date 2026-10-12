import { describe, expect, it } from "vitest";
import { displayOrgnr, isSoleTraderNumber, maskOrgnr, parseProfileInput } from "./input";

describe("parseProfileInput: organisation numbers", () => {
  it("accepts a valid company number in every common shape", () => {
    for (const t of ["5565038212", "556503-8212", " 556503 8212 ", "556503-8212 "]) {
      expect(parseProfileInput(t), t).toMatchObject({ kind: "orgnr", orgnr: "556503-8212", display: "556503-8212", soleTrader: false });
    }
  });
  it("strips the century from a twelve digit number", () => {
    expect(parseProfileInput("165565038212")).toMatchObject({ kind: "orgnr", orgnr: "556503-8212" });
  });
  it("rejects a wrong check digit and the wrong length, in Swedish", () => {
    expect(parseProfileInput("556503-8213")).toMatchObject({ kind: "error", reason: "invalid_orgnr" });
    expect(parseProfileInput("12345")).toMatchObject({ kind: "error", reason: "invalid_orgnr" });
  });
  it("recognises a sole trader and never exposes the last four digits in what is saved", () => {
    // 670406-1230 har giltig kontrollsiffra (Luhn) och tredje siffran 0.
    const r = parseProfileInput("670406-1230");
    expect(r).toMatchObject({ kind: "orgnr", soleTrader: true, display: "670406-****" });
    expect(JSON.stringify({ ...r, orgnr: undefined })).not.toContain("1230");
  });
});

describe("sole trader helpers", () => {
  it("decides on the third digit", () => {
    expect(isSoleTraderNumber("670406-1230")).toBe(true);
    expect(isSoleTraderNumber("556503-8212")).toBe(false);
  });
  it("masks to birth date only, and leaves company numbers alone", () => {
    expect(maskOrgnr("670406-1230")).toBe("670406-****");
    expect(displayOrgnr("670406-1230")).toBe("670406-****");
    expect(displayOrgnr("556503-8212")).toBe("556503-8212");
  });
});

describe("parseProfileInput: web addresses", () => {
  it("normalises a domain, a URL and a URL with a path", () => {
    for (const t of ["foretag.se", "https://www.foretag.se/", "FORETAG.se/om-oss?x=1", "http://foretag.se"]) {
      expect(parseProfileInput(t), t).toEqual({ kind: "url", domain: "foretag.se", url: "https://foretag.se" });
    }
  });
  it("refuses IP addresses and local names", () => {
    for (const t of ["127.0.0.1", "http://169.254.169.254/", "http://10.0.0.5", "server.local", "intranet.corp"]) {
      expect(parseProfileInput(t), t).toMatchObject({ kind: "error" });
    }
  });
  it("refuses single labels, mail addresses and other schemes", () => {
    for (const t of ["localhost", "foretag", "info@foretag.se", "ftp://foretag.se", "javascript:alert(1)"]) {
      expect(parseProfileInput(t), t).toMatchObject({ kind: "error", reason: "invalid_url" });
    }
  });
  it("asks for input when there is none", () => {
    expect(parseProfileInput("   ")).toMatchObject({ kind: "error", reason: "empty" });
  });
});
