import { describe, expect, it } from "vitest";
import { logoCandidates } from "./logo-candidates";

const BASE = "https://byra.se/";
const head = (h: string, body = "") => `<html><head>${h}</head><body>${body}</body></html>`;

describe("logoCandidates", () => {
  it("puts the apple-touch-icon first, then sized icons largest first", () => {
    const r = logoCandidates(head(`<link rel="icon" sizes="32x32" href="/i32.png"><link rel="icon" sizes="192x192" href="/i192.png"><link rel="apple-touch-icon" href="/apple.png">`), BASE);
    expect(r[0]).toBe("https://byra.se/apple.png");
    expect(r[1]).toBe("https://byra.se/i192.png");
    expect(r).not.toContain("https://byra.se/i32.png");
  });
  it("uses the logo the site names in JSON-LD, as a string or an object", () => {
    const a = logoCandidates(head(`<script type="application/ld+json">{"@type":"Organization","logo":"/media/logo.png"}</script>`), BASE);
    expect(a[0]).toBe("https://byra.se/media/logo.png");
    const b = logoCandidates(head(`<script type="application/ld+json">{"@graph":[{"@type":"Organization","logo":{"@type":"ImageObject","url":"https://cdn.byra.se/l.webp"}}]}</script>`), BASE);
    expect(b[0]).toBe("https://cdn.byra.se/l.webp");
  });
  it("finds an image in the header with logo in its name, but not one further down the page", () => {
    const withLogo = logoCandidates(head("", `<header><a href="/"><img src="/img/site-logo.png" alt="Byrån"></a></header><main><img class="hero-logo" src="/img/inne.png"></main>`), BASE);
    expect(withLogo[0]).toBe("https://byra.se/img/site-logo.png");
    expect(withLogo).not.toContain("https://byra.se/img/inne.png");
    expect(logoCandidates(head("", `<header><img src="/foto.jpg" alt="Hej"></header>`), BASE)).not.toContain("https://byra.se/foto.jpg");
  });
  it("never offers SVG, ICO or data URLs", () => {
    const r = logoCandidates(head(`<link rel="icon" type="image/svg+xml" href="/i.svg"><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/a.svg"><script type="application/ld+json">{"logo":"/l.svg"}</script>`, `<header><img src="data:image/png;base64,AAAA" class="logo"><img src="/x-logo.svg"></header>`), BASE);
    expect(r).toEqual(["https://byra.se/apple-touch-icon.png"]);
  });
  it("puts og:image late and the site root icon last", () => {
    const r = logoCandidates(head(`<meta property="og:image" content="/og.jpg"><link rel="icon" href="/plain.png">`), BASE);
    expect(r).toEqual(["https://byra.se/plain.png", "https://byra.se/og.jpg", "https://byra.se/apple-touch-icon.png"]);
  });
  it("resolves relative and protocol-relative addresses, decodes entities, drops other schemes and duplicates", () => {
    const r = logoCandidates(head(`<link rel="apple-touch-icon" href="//cdn.byra.se/a.png?x=1&amp;y=2"><link rel="apple-touch-icon" href="//cdn.byra.se/a.png?x=1&amp;y=2"><link rel="icon" sizes="96x96" href="ftp://x/i.png"><link rel="icon" sizes="96x96" href="javascript:alert(1)">`), "https://www.byra.se/sub/");
    expect(r).toEqual(["https://cdn.byra.se/a.png?x=1&y=2", "https://www.byra.se/apple-touch-icon.png"]);
  });
  it("copes with broken JSON-LD and with a page without any hint", () => {
    expect(logoCandidates(head(`<script type="application/ld+json">{nope</script>`), BASE)).toEqual(["https://byra.se/apple-touch-icon.png"]);
    expect(logoCandidates("", BASE)).toEqual(["https://byra.se/apple-touch-icon.png"]);
  });
});
