import { describe, expect, it } from "vitest";
import { agencyKey, findCreator, findFooterCredits, stripPhrase } from "./creator";

const page = (footer: string) => `<html><body><main><a href="https://infront.se/x">Ej kredit</a></main><footer>${footer}</footer></body></html>`;

describe("findCreator", () => {
  it("reads the agency's name and link after the phrase", () => {
    expect(findCreator(page(`<p>© 2026 Rörande Rör. Hemsida skapad av <a href="https://www.infrontmedia.se/" target="_blank">Infront Media</a></p>`), "roranderor.se")).toEqual({ name: "Infront Media", url: "https://www.infrontmedia.se", domain: "infrontmedia.se" });
  });
  it("reads the name from a link that contains the whole phrase", () => {
    expect(findCreator(page(`<a href="https://webbyran.se/">Webbdesign av Webbyrån Syd</a>`), "foretag.se")).toMatchObject({ name: "Webbyrån Syd", domain: "webbyran.se" });
    expect(findCreator(page(`<a href="https://x.se">Powered by Nordic Digital</a>`), "foretag.se")).toMatchObject({ name: "Nordic Digital" });
  });
  it("takes the name from the image's alt text when the link is only a logo", () => {
    expect(findCreator(page(`Utvecklad av <a href="https://byran.se"><img src="/l.png" alt="Byrån Digital"></a>`), "foretag.se")).toMatchObject({ name: "Byrån Digital", domain: "byran.se" });
  });
  it("falls back to the domain name when the logo link has no alt text", () => {
    expect(findCreator(page(`Gjord av <a href="https://digitalbyra.se"><img src="/l.png"></a>`), "foretag.se")).toMatchObject({ name: "digitalbyra", domain: "digitalbyra.se" });
  });
  it("handles 'gjord med hjärta av'", () => {
    expect(findCreator(page(`Gjord med ❤ av <a href="https://kreativ.se">Kreativ AB</a>`), "foretag.se")).toMatchObject({ name: "Kreativ AB" });
  });
  it("ignores links to the site itself and to tools and social media", () => {
    expect(findCreator(page(`Skapad av <a href="https://www.foretag.se/om">Oss</a>`), "foretag.se")).toBeNull();
    expect(findCreator(page(`Skapad av <a href="https://wordpress.org">WordPress</a>`), "foretag.se")).toBeNull();
    expect(findCreator(page(`Powered by <a href="https://www.facebook.com/x">Facebook</a>`), "foretag.se")).toBeNull();
    expect(findCreator(page(`Webbdesign av <a href="https://shop.foretag.se">Butiken</a>`), "foretag.se")).toBeNull();
  });
  it("does not use a link that is far from the phrase", () => {
    const far = `Hemsida skapad av oss. ${"x ".repeat(400)} <a href="https://annan.se">Annan</a>`;
    expect(findCreator(page(far), "foretag.se")).toBeNull();
  });
  it("only looks in the footer when there is one, so a link in the content never counts", () => {
    const html = `<html><body><p>Webbdesign av <a href="https://innehall.se">Innehåll AB</a></p><footer>© Företaget</footer></body></html>`;
    expect(findCreator(html, "foretag.se")).toBeNull();
  });
  it("uses the end of the page when there is no footer element", () => {
    expect(findCreator(`<html><body>${"x".repeat(100)}<div>Hemsida av <a href="https://byra.se">Byrå Ett</a></div></body></html>`, "foretag.se")).toMatchObject({ name: "Byrå Ett" });
  });
  it("finds a credit with no footer element even when lots of script follows it", () => {
    // esosbygg.se: GeneratePress utan <footer>, och 24 000 tecken skript efter kreditraden.
    const html = `<html><body><main><p>SEO av <a href="https://www.webbofsweden.se/seo">Webb of Sweden</a></p></main><script>${"var x=1;".repeat(3000)}</script><style>${"a{b:c}".repeat(1000)}</style></body></html>`;
    expect(findCreator(html, "esosbygg.se")).toMatchObject({ name: "Webb of Sweden", domain: "webbofsweden.se" });
  });
  it("ignores a footer element that only appears inside a script", () => {
    const html = `<html><body><footer>Hemsida av <a href="https://byra.se">Byrån</a></footer><script>const t = "<footer></footer>";</script></body></html>`;
    expect(findCreator(html, "foretag.se")).toMatchObject({ name: "Byrån" });
  });
  it("reads SEO and marketing credits", () => {
    expect(findCreator(page(`SEO av <a href="https://byra.se">Byrån</a>`), "foretag.se")).toMatchObject({ name: "Byrån" });
    expect(findCreator(page(`Webbdesign &amp; SEO av <a href="https://byra.se">Byrån</a>`), "foretag.se")).toMatchObject({ name: "Byrån" });
    expect(findCreator(page(`Sökmotoroptimering av <a href="https://byra.se">Byrån</a>`), "foretag.se")).toMatchObject({ name: "Byrån" });
    expect(findCreator(page(`Vi hjälper till med marknadsföring av fastigheter i hela landet, läs mer hos <a href="https://partner.se">Partner</a>`), "foretag.se")).toBeNull();
  });
  it("falls back to the name audit found when no link belongs to the phrase", () => {
    expect(findCreator(page(`Hemsida skapad av Infront Media`), "foretag.se", "Infront Media")).toEqual({ name: "Infront Media", url: null, domain: null });
    expect(findCreator(page(`Inget alls`), "foretag.se")).toBeNull();
    expect(findCreator(page(`x`), "foretag.se", "WordPress")).toBeNull();
  });
  it("accepts protocol-relative links, and drops a tracking path down to the host and path", () => {
    expect(findCreator(page(`Skapad av <a href="//byra.se/?utm=1">Byrå</a>`), "foretag.se")).toMatchObject({ url: "https://byra.se", domain: "byra.se" });
  });
  it("never returns a name with tags, entities or an absurd length in it", () => {
    const r = findCreator(page(`Skapad av <a href="https://byra.se"><span>Byr&aring;n &amp; Co</span></a>`), "foretag.se");
    expect(r?.name).toBe("Byrån & Co");
    expect(findCreator(page(`Skapad av <a href="https://byra.se">${"Lång ".repeat(40)}</a>`), "foretag.se")?.name).toBe("byra");
  });
});

describe("agencyKey", () => {
  it("drops generic trailing words but never the whole name", () => {
    expect(agencyKey("Conseo Webb")).toBe("conseo");
    expect(agencyKey("Infront Media AB")).toBe("infront");
    expect(agencyKey("Webb")).toBe("webb");
  });
});

describe("credit phrases", () => {
  it("strips the phrase from a name, including the image alt of a logo link", () => {
    expect(stripPhrase("Powered by Snowfire")).toBe("Snowfire");
    expect(stripPhrase("Skapad av Beegleton")).toBe("Beegleton");
    expect(stripPhrase("Webbyrån Syd")).toBe("Webbyrån Syd");
    expect(findCreator(page(`<a href="https://byran.se"><img src="l.svg" alt="Powered by Byrån Digital"></a>`), "foretag.se")).toMatchObject({ name: "Byrån Digital" });
  });
  it("does not mistake the letters 'by' inside a word for a phrase", () => {
    expect(findFooterCredits(page(`Hobby <a href="https://nagon.se">Någon</a>`), "foretag.se").agency).toBeNull();
  });
  it("prefers 'skapad av' over 'powered by', and keeps a known platform out of the agency slot", () => {
    const html = page(`<a href="https://snowfire.se/x"><img alt="Powered by Snowfire"></a> Skapad av <a href="https://beegleton.com">Beegleton</a>`);
    const r = findFooterCredits(html, "karaten.com", null, (d) => d === "snowfire.se");
    expect(r.agency).toMatchObject({ name: "Beegleton", phrase: "made-by" });
    expect(r.platforms).toEqual([{ name: "Snowfire", url: "https://snowfire.se/x", domain: "snowfire.se" }]);
  });
  it("treats a link marked utm_campaign=poweredby as a platform whatever the wording", () => {
    const r = findFooterCredits(page(`<a href="https://okand.se/?utm_campaign=poweredby">Powered by Okänd</a>`), "foretag.se");
    expect(r.agency).toBeNull();
    expect(r.platforms.map((p) => p.domain)).toEqual(["okand.se"]);
  });
});

describe("credits written as nouns", () => {
  it("reads 'Design / Utveckling av X' and the common variants", () => {
    expect(findCreator(page(`Design / Utveckling av <a href="https://arly.se/">ARLY</a>`), "sabygg.nu")).toMatchObject({ name: "ARLY", domain: "arly.se" });
    expect(findCreator(page(`Webbdesign &amp; produktion av <a href="https://byra.se">Byrån</a>`), "foretag.se")).toMatchObject({ name: "Byrån" });
    expect(findCreator(page(`Design och utveckling av <a href="https://byra.se">Byrån</a>`), "foretag.se")).toMatchObject({ name: "Byrån" });
    expect(findCreator(page(`Webbplats av <a href="https://byra.se">Byrån</a>`), "foretag.se")).toMatchObject({ name: "Byrån" });
  });
  it("does not take ordinary footer text for a credit: a noun phrase needs the link right after it", () => {
    expect(findCreator(page(`Vi arbetar med utveckling av bostäder och mycket mer text här som fyller ut raden <a href="https://partner.se">Partner</a>`), "foretag.se")).toBeNull();
    expect(findCreator(page(`Teknik av hög kvalitet och mycket annat. <a href="https://annat.se">Annat</a>`), "foretag.se")).toBeNull();
  });
});

