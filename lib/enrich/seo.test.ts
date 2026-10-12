import { describe, expect, it } from "vitest";
import { toText } from "./extract";
import { auditSeo, findSchemaTypes, seoImprovements } from "./seo";

const words = (count: number) => Array.from({ length: count }, (_, i) => `ord${i % 10 === 0 ? "" : "a"}`).join(" ");

const GOOD = `<!doctype html>
<html lang="sv"><head>
  <title>Frisör i Växjö – klippning och färg | Salong Ada</title>
  <meta name="description" content="Salong Ada är en frisör mitt i Växjö. Vi klipper, färgar och gör slingor för dam, herr och barn. Boka tid online dygnet runt.">
  <link rel="canonical" href="https://salongada.se/">
  <meta property="og:title" content="Salong Ada"><meta property="og:image" content="https://salongada.se/og.jpg">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":["HairSalon","LocalBusiness"],"address":{"@type":"PostalAddress"}}]}</script>
</head><body>
  <h1>Frisör i Växjö</h1>
  <img src="a.jpg" alt="Salongen"><img src="b.jpg" alt="Klippning"><img src="c.jpg" alt="Färgning">
  <a href="tel:+46470123456">Ring</a>
  <p>${words(300)}</p>
</body></html>`;

const BAD = `<html><head>
  <title>Hem</title>
  <meta name="robots" content="noindex, nofollow">
  <script type="application/ld+json">{"@type":"WebSite"}</script>
</head><body>
  <h1>Välkommen</h1><h1>Om oss</h1>
  <img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="Logga">
  <p>Kort text.</p>
</body></html>`;

describe("auditSeo", () => {
  it("reads a well-built page", () => {
    const seo = auditSeo(GOOD, toText(GOOD));
    expect(seo).toMatchObject({
      title: "Frisör i Växjö – klippning och färg | Salong Ada",
      h1Count: 1,
      lang: "sv",
      canonical: true,
      openGraph: true,
      noindex: false,
      images: 3,
      imagesWithoutAlt: 0,
      telLink: true,
    });
    expect(seo.schemaTypes).toEqual(["HairSalon", "LocalBusiness", "PostalAddress", "WebSite"]);
    expect(seo.wordCount).toBeGreaterThan(150);
    expect(seoImprovements(seo)).toEqual([]);
  });

  it("finds everything wrong with a bare page, most important first", () => {
    const labels = seoImprovements(auditSeo(BAD, toText(BAD))).map((item) => item.label);
    expect(labels).toEqual([
      "Startsidan är dold för Google",
      'Sidtiteln är bara "Hem"',
      "Ingen företagsmärkning (LocalBusiness)",
      "Ingen metabeskrivning",
      "Lite text på startsidan",
      "Inget klickbart telefonnummer",
      "2 huvudrubriker (H1)",
      "2 av 3 bilder saknar alt-text",
      "Ingen förhandsvisning vid delning",
      "Inget språk angivet",
      "Ingen kanonisk adress",
    ]);
  });
});

describe("findSchemaTypes", () => {
  it("reads microdata and survives a broken JSON-LD block", () => {
    const html = `<script type="application/ld+json">{not json</script><div itemscope itemtype="https://schema.org/Dentist"></div>`;
    expect(findSchemaTypes(html)).toEqual(["Dentist"]);
  });

  it("does not take the default Organization from an SEO plugin as business markup", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Organization","logo":{"@type":"ImageObject"}}]}</script>`;
    expect(seoImprovements(auditSeo(html, "")).map((item) => item.label)).toContain(
      "Ingen företagsmärkning (LocalBusiness)",
    );
  });

  it("says 'no structured data' when there is none at all", () => {
    const seo = auditSeo("<title>Tandläkare Nord i Umeå</title>", "");
    expect(seoImprovements(seo).map((item) => item.label)).toContain("Ingen strukturerad data");
  });
});
