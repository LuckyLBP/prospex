import { describe, expect, it } from "vitest";
import { linkInventory, socialLinks } from "./links";

const BASE = "https://example.se/";
const html = (...links: string[]) => `<html><body>${links.map((l) => `<a href="${l}">${l.split("/").pop() || "start"}</a>`).join("")}</body></html>`;

describe("linkInventory", () => {
  it("keeps pages on the same site, makes them absolute, and drops the start page itself", () => {
    const r = linkInventory(`<a href="/om-oss">Om oss</a><a href="https://www.example.se/tjanster/">Tjänster</a><a href="/">Hem</a><a href="https://example.se">Start</a>`, BASE, "example.se");
    expect(r.map((l) => l.url).sort()).toEqual(["https://example.se/om-oss", "https://www.example.se/tjanster/"]);
  });
  it("drops other domains, lookalikes, mail and phone links, files, anchors and shop internals", () => {
    const r = linkInventory(
      html("https://evil.com/om-oss", "https://example.se.evil.com/x", "mailto:a@example.se", "tel:+4681234567", "/broschyr.pdf", "/bild.jpg", "/wp-admin/", "/varukorg", "/checkout", "javascript:void(0)", "/ok-sida"),
      BASE,
      "example.se",
    );
    expect(r.map((l) => l.url)).toEqual(["https://example.se/ok-sida"]);
  });
  it("ranks pages that describe the company first, and caps the list", () => {
    const links = [...Array.from({ length: 60 }, (_, i) => `/nyhet-${i}`), "/om-oss", "/tjanster", "/kontakt"];
    const r = linkInventory(html(...links), BASE, "example.se", 10);
    expect(r).toHaveLength(10);
    expect(r.slice(0, 3).map((l) => new URL(l.url).pathname)).toEqual(["/om-oss", "/tjanster", "/kontakt"]);
  });
  it("lists a page once even if it is linked twice, and ignores the fragment", () => {
    const r = linkInventory(html("/om-oss", "/om-oss#team", "/Om-oss/"), BASE, "example.se");
    expect(r.length).toBeLessThanOrEqual(2);
    expect(r.filter((l) => l.url.toLowerCase().includes("om-oss"))).not.toHaveLength(0);
  });
  it("reads anchor text, with tags and entities removed", () => {
    expect(linkInventory(`<a href="/priser"><span>Våra&nbsp;priser</span></a>`, BASE, "example.se")[0]).toMatchObject({ text: expect.stringContaining("priser") });
  });
});

describe("socialLinks", () => {
  it("finds the company's own accounts, one per network", () => {
    const r = socialLinks(`<a href="https://www.facebook.com/foretaget">f</a><a href="https://www.instagram.com/foretaget/">i</a><a href="https://se.linkedin.com/company/foretaget">l</a><a href="https://www.youtube.com/@foretaget">y</a><a href="https://twitter.com/foretaget">x</a><a href="https://www.facebook.com/annat">dup</a>`);
    expect(r.map((s) => s.network)).toEqual(["facebook", "instagram", "linkedin", "youtube", "x"]);
    expect(r[0].url).toBe("https://www.facebook.com/foretaget");
  });
  it("ignores share buttons, tracking pixels and posts", () => {
    expect(socialLinks(`<a href="https://www.facebook.com/sharer/sharer.php?u=x">s</a><a href="https://www.facebook.com/tr?id=1">t</a><a href="https://www.instagram.com/p/abc">p</a><a href="https://twitter.com/intent/tweet">t</a>`)).toEqual([]);
  });
});
