import { describe, expect, it } from "vitest";
import { creatorMatchesAgency, footerLinksTo, isSameOrSubdomain } from "./match";

const conseo = { name: "Conseo Webb", domain: "conseo.se" };

describe("isSameOrSubdomain", () => {
  it("matches the domain and its subdomains only", () => {
    expect(isSameOrSubdomain("conseo.se", "conseo.se")).toBe(true);
    expect(isSameOrSubdomain("https://www.conseo.se/kontakt", "conseo.se")).toBe(true);
    expect(isSameOrSubdomain("notconseo.se", "conseo.se")).toBe(false);
    expect(isSameOrSubdomain(null, "conseo.se")).toBe(false);
  });
});

describe("creatorMatchesAgency", () => {
  it("accepts the agency by domain or by core name", () => {
    expect(creatorMatchesAgency({ name: "Någon annan", domain: "conseo.se" }, conseo)).toBe(true);
    expect(creatorMatchesAgency({ name: "Conseo", domain: null }, conseo)).toBe(true);
    expect(creatorMatchesAgency({ name: "Conseo Webb AB", domain: null }, conseo)).toBe(true);
  });
  it("rejects another agency, a missing credit and a name that is too vague", () => {
    expect(creatorMatchesAgency({ name: "Infront Media", domain: "infront.se" }, conseo)).toBe(false);
    expect(creatorMatchesAgency(null, conseo)).toBe(false);
    expect(creatorMatchesAgency({ name: "Webb", domain: null }, { name: "Webb", domain: "webb.se" })).toBe(false);
  });
});

describe("footerLinksTo", () => {
  const page = (footer: string, main = "") => `<html><body><main>${main}</main><footer>${footer}</footer></body></html>`;
  it("sees an external link to the agency in the footer", () => {
    expect(footerLinksTo(page(`<a href="https://conseo.se/">Conseo</a>`), "conseo.se")).toBe(true);
    expect(footerLinksTo(page(`<a href='//www.conseo.se'>x</a>`), "conseo.se")).toBe(true);
  });
  it("ignores links outside the footer, to other domains and relative links", () => {
    expect(footerLinksTo(page(`© Företaget`, `<a href="https://conseo.se">Vår partner</a>`), "conseo.se")).toBe(false);
    expect(footerLinksTo(page(`<a href="https://annan.se">x</a>`), "conseo.se")).toBe(false);
    expect(footerLinksTo(page(`<a href="/conseo.se">x</a>`), "conseo.se")).toBe(false);
  });
});
