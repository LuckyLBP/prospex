import { describe, expect, it } from "vitest";
import { decodeEntities, extractCompanyName, isInterstitial, extractContacts, extractEmails, extractPhones } from "./extract";

const PAGE = `<!doctype html>
<html lang="sv">
<head>
  <title>Boka tid | Salong Ada | Stockholm</title>
  <meta property="og:site_name" content="Salong Ada">
  <style>.a{content:"fake@style.css"}</style>
  <script>var track="noreply@sentry.io";</script>
</head>
<body>
  <a href="tel:+46 8 123 45 67">Ring oss</a>
  <a href="mailto:info@salongada.se">Mejla</a>
  <p>Vi finns på Storgatan 1. Ring 070-123 45 67 eller mejla anna@gmail.com.</p>
  <footer>Salong Ada AB · Org.nr 556677-8899</footer>
</body>
</html>`;

describe("extractCompanyName", () => {
  it("prefers og:site_name, which is the site naming itself", () => {
    expect(extractCompanyName(PAGE)).toBe("Salong Ada");
  });

  it("falls back to the first meaningful title segment", () => {
    expect(extractCompanyName("<title>Salong Ada | Boka tid</title>")).toBe("Salong Ada");
    expect(extractCompanyName("<title>Salong Ada – Frisör i Växjö</title>")).toBe("Salong Ada");
  });

  it("skips a generic first segment instead of storing 'Hem' as a company", () => {
    expect(extractCompanyName("<title>Startsida | Salong Ada</title>")).toBe("Salong Ada");
    expect(extractCompanyName("<title>Hem - Klinik Nord</title>")).toBe("Klinik Nord");
  });

  it("returns null when there is nothing to read", () => {
    expect(extractCompanyName("<html><body>hej</body></html>")).toBeNull();
  });
});

describe("extractEmails", () => {
  it("ranks a mailto on the site's own domain first", () => {
    const emails = extractEmails(PAGE, "salongada.se");
    expect(emails[0]).toBe("info@salongada.se");
    expect(emails).toContain("anna@gmail.com");
  });

  it("drops tooling noise from scripts and styles", () => {
    const emails = extractEmails(PAGE, "salongada.se");
    expect(emails).not.toContain("noreply@sentry.io");
    expect(emails.some((e) => e.includes("style.css"))).toBe(false);
  });

  it("prefers a role address over a personal one on the same domain", () => {
    const html = `<p>anna.andersson@klinik.se</p><p>kontakt@klinik.se</p>`;
    expect(extractEmails(html, "klinik.se")[0]).toBe("kontakt@klinik.se");
  });

  it("finds nothing in a page with no addresses", () => {
    expect(extractEmails("<p>Ring oss!</p>", "x.se")).toEqual([]);
  });
});

describe("extractPhones", () => {
  it("takes the tel: link first and normalises every number found", () => {
    const phones = extractPhones(PAGE);
    expect(phones[0]).toBe("+4681234567");
    expect(phones).toContain("+46701234567");
  });

  it("does not mistake an org number for a phone number", () => {
    expect(extractPhones("<p>Org.nr 556677-8899</p>")).toEqual([]);
  });
});

describe("extractContacts", () => {
  it("reads a whole company off one page", () => {
    const result = extractContacts(PAGE, "salongada.se");
    expect(result).toMatchObject({
      companyName: "Salong Ada",
      email: "info@salongada.se",
      phone: "+4681234567",
      orgnr: "556677-8899",
    });
    // Every candidate is kept so a wrong pick can be audited later.
    expect(result.emails.length).toBeGreaterThan(1);
  });

  it("returns nulls rather than throwing on an empty page", () => {
    expect(extractContacts("", null)).toMatchObject({
      companyName: null,
      email: null,
      phone: null,
      orgnr: null,
    });
  });
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("Betong &amp; Prefab &#8211; V&auml;st &#x27;25")).toBe(
      "Betong & Prefab – Väst '25",
    );
  });

  it("leaves an entity it does not know alone", () => {
    expect(decodeEntities("A &notanentity; B")).toBe("A &notanentity; B");
  });
});

describe("extractCompanyName, entities", () => {
  it("decodes og:site_name instead of storing the escaped form", () => {
    expect(
      extractCompanyName('<meta property="og:site_name" content="Betong &amp; Prefab">'),
    ).toBe("Betong & Prefab");
  });

  it("decodes a title before splitting it", () => {
    expect(extractCompanyName("<title>Tak &amp; Fasad AB | Skara</title>")).toBe("Tak & Fasad AB");
  });
});

describe("isInterstitial", () => {
  const CHALLENGE =
    '<html><head><link rel="icon" href="data:;">' +
    '<meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2F"></meta></head></html>';

  it("recognises a meta-refresh challenge stub", () => {
    expect(isInterstitial(CHALLENGE)).toBe(true);
  });

  it("leaves a real page alone, even one that also refreshes", () => {
    expect(
      isInterstitial('<html><head><title>Bygg Visby</title><meta http-equiv="refresh" content="600"></head><body><p>Vi bygger på Gotland sedan 1994 och hjälper dig med allt från grund till tak.</p></body></html>'),
    ).toBe(false);
  });

  it("leaves a short page with a title alone", () => {
    expect(isInterstitial("<html><head><title>Salong Ada</title></head><body></body></html>")).toBe(false);
  });
});
