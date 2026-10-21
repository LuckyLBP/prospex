import { describe, expect, it } from "vitest";
import { agencyFingerprint, contactsAgency, creatorMatchesAgency, footerLinksTo, isSameOrSubdomain } from "./match";

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

// Kunder till Smartproduktion visar ingen kredit i sidfoten, men sidans kod bär deras namn: en variabel i ett skript och
// byråns e-postadress i den strukturerade datan. Utdragen är från riktiga sajter som körningen räknade som "utan kredit".
describe("a platform's own variable and the agency's email in structured data", () => {
  const agency = { name: "Smartproduktion Sverige AB", domain: "smartproduktion.se" };

  it("finds a variable named after the agency as a fingerprint", () => {
    const html = `<script> window.addEventListener("DOMContentLoaded", function () { window.smartproduktion_design_data = {"color_primary":"#246ae0"}; }); </script>`;
    expect(agencyFingerprint(html, agency)).toBe("Kod: smartproduktion_design_data");
  });
  it("does not take the agency's name in plain text, in a longer word or as a prefix of another name", () => {
    expect(agencyFingerprint(`<p>Vi har jobbat med smartproduktion tidigare.</p>`, agency)).toBeNull();
    expect(agencyFingerprint(`<script>var mysmartproduktion_x = 1;</script>`, agency)).toBeNull();
    expect(agencyFingerprint(`<script>var smartproduktion = 1; var smartproduktion_ = 2;</script>`, agency)).toBeNull();
  });
  it("finds the agency's address as the page's own email in structured data", () => {
    const html = `<script type="application/ld+json">{"@type": "LocalBusiness", "name": "Alla Rörmokare", "url": "https://www.allarormokare.se/", "email": "info@smartproduktion.se"}</script>`;
    expect(contactsAgency(html, "smartproduktion.se")).toBe("info@smartproduktion.se");
  });
  it("does not take an address that is only mentioned in text, or an email at another domain", () => {
    expect(contactsAgency(`<p>Skriv till info@smartproduktion.se om du vill ha en hemsida.</p>`, "smartproduktion.se")).toBeNull();
    expect(contactsAgency(`{"email": "kontakt@rormokare.se"}`, "smartproduktion.se")).toBeNull();
  });
  it("still reads a mailto link, also with a broken percent sign", () => {
    expect(contactsAgency(`<a href="mailto:offert@smartproduktion.se?subject=hej">Mejla</a>`, "smartproduktion.se")).toBe("offert@smartproduktion.se");
    expect(contactsAgency(`<a href="mailto:50%@smartproduktion.se">x</a>`, "smartproduktion.se")).toBe("50%@smartproduktion.se");
  });
});
