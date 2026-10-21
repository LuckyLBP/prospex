import { describe, expect, it } from "vitest";
import { agencyBrands, agencyFingerprint, agencyTrace } from "./match";
import { findTraces, SEARCHABLE } from "./traces";

const smart = { name: "Smartproduktion Sverige AB", domain: "smartproduktion.se" };
const kinds = (html: string, agency = smart) => findTraces(html, agency, agencyBrands(agency)).map((t) => t.kind);

describe("findTraces", () => {
  it("finds the variable a platform puts in its customers' pages (real: smartproduktion_design_data)", () => {
    const html = `<script> window.addEventListener("DOMContentLoaded", function () { window.smartproduktion_design_data = {"color_primary":"#246ae0"}; }); </script>`;
    expect(findTraces(html, smart, agencyBrands(smart))).toEqual([{ kind: "identifier", token: "smartproduktion_design_data", evidence: "Kod: smartproduktion_design_data" }]);
  });
  it("finds a theme and a plugin that carry the agency's name", () => {
    // Sökvägen är också en fil med byråns namn, men temat och tillägget kommer först och är det som visas.
    expect(kinds(`<link href="/wp-content/themes/smartproduktion-child/style.css">`)[0]).toBe("theme");
    expect(kinds(`<script src="/wp-content/plugins/smartproduktion-forms/js/form.js"></script>`)[0]).toBe("plugin");
  });
  it("finds data attributes, CSS variables and files named after the agency", () => {
    expect(findTraces(`<div data-smartproduktion-block="hero"></div>`, smart, agencyBrands(smart))[0]).toMatchObject({ kind: "attribute", token: "data-smartproduktion-block" });
    expect(kinds(`<style>:root { --smartproduktion-primary: #fff; }</style>`)).toEqual(["attribute"]);
    expect(findTraces(`<script src="/assets/smartproduktion/form.js"></script>`, smart, agencyBrands(smart))[0]).toMatchObject({ kind: "asset" });
  });
  it("finds requests to the agency's own addresses, but not an ordinary link to it", () => {
    expect(kinds(`<form action="https://forms.smartproduktion.se/submit" method="post"></form>`)).toEqual(["endpoint"]);
    expect(kinds(`<script>fetch("https://api.smartproduktion.se/v1/leads")</script>`)).toEqual(["endpoint"]);
    expect(kinds(`<script src="https://cdn.smartproduktion.se/app.js"></script>`)).toEqual(["resource"]);
    expect(kinds(`<a href="https://smartproduktion.se/">Vår partner</a><a href="mailto:info@smartproduktion.se">Mejla</a>`)).toEqual([]);
  });
  it("finds a comment in the code that names the agency", () => {
    expect(findTraces(`<!-- Byggd av Smartproduktion --><body></body>`, smart, agencyBrands(smart))[0]).toMatchObject({ kind: "comment" });
  });
  it("does not take the agency's name in plain text or inside another word", () => {
    expect(kinds(`<p>Vi har jobbat med Smartproduktion tidigare.</p>`)).toEqual([]);
    expect(kinds(`<script>var mysmartproduktion_x = 1; var smartproduktion = 2;</script>`)).toEqual([]);
    expect(kinds(`<!-- vi tackar alla som läser --><p>text</p>`)).toEqual([]);
  });
  it("only calls the traces searchable that are a name, not a whole address", () => {
    expect(SEARCHABLE.has("identifier")).toBe(true);
    expect(SEARCHABLE.has("attribute")).toBe(true);
    expect(SEARCHABLE.has("endpoint")).toBe(false);
    expect(SEARCHABLE.has("comment")).toBe(false);
  });
});

describe("agencyTrace and agencyFingerprint", () => {
  it("give the first trace, with its kind and token, and its evidence text", () => {
    const html = `<meta name="generator" content="Smartproduktion Builder 2"><script>var smartproduktion_x_y = 1;</script>`;
    expect(agencyTrace(html, smart)).toEqual({ kind: "generator", token: "Smartproduktion Builder 2", evidence: "Generator: Smartproduktion Builder 2" });
    expect(agencyFingerprint(html, smart)).toBe("Generator: Smartproduktion Builder 2");
    expect(agencyFingerprint("<p>hej</p>", smart)).toBeNull();
  });
});
