import { describe, expect, it } from "vitest";
import { parseProfilePage, parseProfileUrls } from "./brabyggare-parse";

function page(entity: Record<string, unknown>): string {
  const ld = { "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: entity };
  return `<html><head>
    <script type="application/ld+json">{"@type":"Organization","name":"Bra Byggare"}</script>
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
  </head></html>`;
}

const URL_125 = "https://www.brabyggare.se/hantverkare/125/";

describe("parseProfileUrls", () => {
  it("keeps only contractor profiles, once each", () => {
    const xml = `<urlset>
      <url><loc>https://www.brabyggare.se/sok-hantverkare/</loc></url>
      <url><loc>https://www.brabyggare.se/info/valja-ratt-hantverkare/</loc></url>
      <url><loc>https://www.brabyggare.se/hantverkare/125/</loc></url>
      <url><loc>https://www.brabyggare.se/hantverkare/241/</loc></url>
      <url><loc>https://www.brabyggare.se/hantverkare/125/</loc></url>
    </urlset>`;
    expect(parseProfileUrls(xml)).toEqual([URL_125, "https://www.brabyggare.se/hantverkare/241/"]);
  });
});

describe("parseProfilePage", () => {
  it("reads the company from the ProfilePage block", () => {
    const item = parseProfilePage(
      page({
        name: "Måleritema i Haninge AB",
        url: "http://www.maleritema.se/",
        telephone: "08-776 44 00",
        email: "Info@maleritema.se",
        identifier: [{ "@type": "PropertyValue", value: "556402-8552" }],
        address: { streetAddress: "Daggkåpevägen 20", postalCode: "13673", addressLocality: "Vendelsö" },
      }),
      URL_125,
    );
    expect(item).toMatchObject({
      dedupeKey: "maleritema.se",
      domain: "maleritema.se",
      website: "https://maleritema.se",
      sourceUrl: URL_125,
      companyName: "Måleritema i Haninge AB",
      email: "info@maleritema.se",
      orgnr: "556402-8552",
      prefilled: true,
    });
    expect(item?.phone).toBeTruthy();
    expect(item?.raw).toMatchObject({ brabyggare_id: "125", city: "Vendelsö" });
  });

  it("does not take a Facebook page as the company's domain", () => {
    const item = parseProfilePage(
      page({ name: "DAVIDs Bygg", url: "https://www.facebook.com/www.dbhi.se/" }),
      URL_125,
    );
    expect(item).toMatchObject({ dedupeKey: "brabyggare:125", domain: null, website: null });
  });

  it("drops a masked personal number", () => {
    const item = parseProfilePage(
      page({ name: "Edward Kakel", identifier: [{ value: "670303-XXXX" }] }),
      URL_125,
    );
    expect(item?.orgnr).toBeNull();
  });

  it("returns null for a page without a profile block", () => {
    expect(parseProfilePage("<html></html>", URL_125)).toBeNull();
  });
});
