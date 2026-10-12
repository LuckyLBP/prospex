import { describe, expect, it } from "vitest";
import { auditSite, findCopyrightYear, findCredit, isOutdated, readSiteAudit, siteIssues } from "./audit";

const NOW = new Date("2026-10-05T10:00:00Z");

const OLD_WORDPRESS = `<!doctype html>
<html><head>
  <meta name="generator" content="WordPress 5.8.1">
  <link rel="stylesheet" href="https://salong.se/wp-content/themes/hello-swapi/style.css">
  <link rel="stylesheet" href="https://salong.se/wp-content/plugins/elementor/assets/frontend.css">
</head><body>
  <a href="https://www.bokadirekt.se/places/salong-ada">Boka</a>
  <footer>© 2015–2019 Salong Ada AB. Hemsida skapad av Conseo alla rättigheter förbehållna</footer>
</body></html>`;

const MODERN = `<!doctype html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta content="Frisör i Växjö sedan 1998" name="description">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>
  <script>!function(f,b,e,v,n,t,s){}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');</script>
  <link href="https://static1.squarespace.com/static/x.css" rel="stylesheet">
</head><body><footer>Copyright 2026 Klippet</footer></body></html>`;

describe("auditSite", () => {
  it("reads an old WordPress site the way a seller would describe it", () => {
    const audit = auditSite(OLD_WORDPRESS, "http://salong.se/", NOW);
    expect(audit).toMatchObject({
      https: false,
      mobile: false,
      cms: "WordPress",
      cmsVersion: "5.8.1",
      builder: "Elementor",
      theme: "hello-swapi",
      copyrightYear: 2019,
      credit: "Conseo",
      analytics: false,
      booking: "Bokadirekt",
      metaDescription: false,
    });
  });

  it("reads a modern site as modern", () => {
    const audit = auditSite(MODERN, "https://klippet.se/", NOW);
    expect(audit).toMatchObject({
      https: true,
      mobile: true,
      cms: "Squarespace",
      builder: null,
      copyrightYear: 2026,
      analytics: true,
      metaPixel: true,
      metaDescription: true,
    });
    expect(isOutdated(audit, NOW)).toBe(false);
  });

  it("only looks for a page builder on WordPress", () => {
    const wix = `<img src="https://static.wixstatic.com/a.png"><div class="vc_row"></div>`;
    expect(auditSite(wix, "https://x.se", NOW)).toMatchObject({ cms: "Wix", builder: null });
  });
});

describe("findCopyrightYear", () => {
  it("takes the latest year in the line", () => {
    expect(findCopyrightYear("© 2012 - 2018 Firma", NOW)).toBe(2018);
  });

  it("ignores years that have not happened, and text that is not a copyright line", () => {
    expect(findCopyrightYear("Grundat 2003. © 2031", NOW)).toBeNull();
    expect(findCopyrightYear("Öppet sedan 2003", NOW)).toBeNull();
  });
});

describe("findCredit", () => {
  it("finds the agency in the usual footer phrasings", () => {
    expect(findCredit("Webbdesign av Swedags Webbyrå")).toBe("Swedags Webbyrå");
    expect(findCredit("Gjord med ❤ av Perspektiv Reklambyrå")).toBe("Perspektiv Reklambyrå");
    expect(findCredit("Utvecklad av Sharpmind Digitalbyrå. Alla rättigheter")).toBe("Sharpmind Digitalbyrå");
    expect(findCredit("Powered by Webpowered")).toBe("Webpowered");
  });

  it("stops at the first lowercase word", () => {
    expect(findCredit("Hemsida skapad av Conseo alla rättigheter förbehållna")).toBe("Conseo");
  });

  it("does not credit the tool", () => {
    expect(findCredit("Proudly powered by WordPress")).toBeNull();
  });
});

describe("siteIssues", () => {
  it("puts the reasons to call first and the nice-to-knows last", () => {
    const audit = auditSite(OLD_WORDPRESS, "http://salong.se/", NOW);
    expect(siteIssues(audit, NOW).map((issue) => issue.label)).toEqual([
      "Ingen HTTPS",
      "Inte mobilanpassad",
      "© 2019 i sidfoten",
      "WordPress 5.8.1",
      "Ingen Google Analytics",
    ]);
    expect(isOutdated(audit, NOW)).toBe(true);
  });

  it("does not call a site outdated for missing analytics alone", () => {
    const audit = auditSite(MODERN.replace(/<script[\s\S]*?<\/script>/g, ""), "https://klippet.se/", NOW);
    expect(siteIssues(audit, NOW).map((issue) => issue.label)).toEqual(["Ingen Google Analytics"]);
    expect(isOutdated(audit, NOW)).toBe(false);
  });
});

describe("readSiteAudit", () => {
  it("accepts what auditSite wrote and nothing else", () => {
    expect(readSiteAudit(auditSite(MODERN, "https://k.se", NOW))).not.toBeNull();
    expect(readSiteAudit({ version: 2 })).toBeNull();
    expect(readSiteAudit(null)).toBeNull();
  });
});
