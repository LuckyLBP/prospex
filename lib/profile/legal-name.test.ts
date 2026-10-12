import { describe, expect, it } from "vitest";
import { findLegalNames } from "./legal-name";

const page = (body: string, head = "") => `<html><head>${head}</head><body>${body}</body></html>`;

describe("findLegalNames", () => {
  it("reads the footer of sabygg.nu: name, street, postal code and city", () => {
    const html = page(`<main>Verksamheten har sitt fäste i Borås och Göteborg. Våra kunder är idag stora fastighetsbolag med lägenhetshus.</main>
      <footer><div>SA Konstruktion &amp; Bygg AB</div><div>Åkermans väg 3</div><div>504 31 Borås</div><div>Sverige</div><div>E-post: info @ sabygg.nu</div></footer>`);
    expect(findLegalNames([html])[0]).toEqual({ name: "SA Konstruktion & Bygg AB", street: "Åkermans väg 3", postalCode: "50431", city: "Borås", source: "text" });
  });
  it("works when the name and address run together on one line", () => {
    const [c] = findLegalNames([page(`<footer>© 2026 Kund Företaget AB, Storgatan 12, 211 11 Malmö. Org.nr saknas.</footer>`)]);
    expect(c).toMatchObject({ name: "Kund Företaget AB", postalCode: "21111", city: "Malmö", street: "Storgatan 12" });
  });
  it("does not take the sentence before the name into it, nor a lowercase 'ab'", () => {
    const [c] = findLegalNames([page(`<footer><p>Vi är certifierade och trygga. Rörande Rör AB 412 63 Göteborg</p></footer>`)]);
    expect(c.name).toBe("Rörande Rör AB");
    expect(findLegalNames([page(`<p>Vi är ett AB med lång erfarenhet.</p>`)])).toEqual([]);
  });
  it("reads the legal name and address from JSON-LD, and prefers it", () => {
    const ld = `<script type="application/ld+json">{"@type":"LocalBusiness","legalName":"Nordic Bygg AB","address":{"streetAddress":"Hamngatan 4","postalCode":"411 01","addressLocality":"Göteborg"}}</script>`;
    expect(findLegalNames([page(`<footer>Nordic Bygg AB</footer>`, ld)])[0]).toEqual({ name: "Nordic Bygg AB", street: "Hamngatan 4", postalCode: "41101", city: "Göteborg", source: "json-ld" });
  });
  it("handles Handelsbolag and KB, ranks names with an address first, and returns at most three", () => {
    const html = page(`<footer>Fri Lunch HB. Annan Firma KB 123 45 Ort. Tredje AB. Fjärde AB. Femte AB</footer>`);
    const r = findLegalNames([html]);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r[0].name).toBe("Annan Firma KB");
    expect(r.map((c) => c.name)).toContain("Fri Lunch HB");
  });
  it("gives nothing for a page without a company form", () => {
    expect(findLegalNames([page(`<footer>© 2026 Frisör Ett. Storgatan 1, 111 22 Stockholm</footer>`)])).toEqual([]);
  });

  it("leaves out navigation words and a preceding postal code and city", () => {
    expect(findLegalNames([page(`<footer>Följ Följ Följ Foxor AB Sporregatan 20 213 77 Malmö</footer>`)])[0].name).toBe("Foxor AB");
    expect(findLegalNames([page(`<footer>Kontakt JiA Byggtjänst i Borås AB Lomgatan 4 507 34 Brämhult</footer>`)])[0].name).toBe("JiA Byggtjänst i Borås AB");
    expect(findLegalNames([page(`<footer>Copyright Nordiska Göteborg Byggentreprenad AB</footer>`)])[0].name).toBe("Nordiska Göteborg Byggentreprenad AB");
    expect(findLegalNames([page(`<footer>Knallegatan 10, 441 51 Alingsås Nordiska Byggentreprenad AB</footer>`)])[0].name).toBe("Nordiska Byggentreprenad AB");
  });

  it("splits a sloppy JSON-LD address that has the whole address in the street field", () => {
    const ld = `<script type="application/ld+json">{"@type":"Organization","legalName":"Nordiska Göteborg Byggentreprenad AB","address":{"streetAddress":"Knallegatan 10, 441 51 Alingsås","addressLocality":"Stenkullen"}}</script>`;
    expect(findLegalNames([page(`<footer>x</footer>`, ld)])[0]).toMatchObject({ street: "Knallegatan 10", postalCode: "44151", city: "Stenkullen" });
  });
  it("does not take 'Org' from 'Org.nr' as part of the city", () => {
    expect(findLegalNames([page(`<footer>Foxor AB Sporregatan 20 213 77 Malmö Org.nr 556855-9479</footer>`)])[0]).toMatchObject({ city: "Malmö", postalCode: "21377" });
  });
});

