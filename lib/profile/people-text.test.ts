import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { condensePage, decodeCfEmail, revealCloudflareEmails, revealTextEmails } from "./people-text";

const fixture = readFileSync(join(__dirname, "fixtures", "people", "sabygg-kontakt.html"), "utf8");

describe("decodeCfEmail", () => {
  it("decodes Cloudflare's protected addresses (real ones from sabygg.nu)", () => {
    expect(decodeCfEmail("3447405152555a1a5558595346515a744755564d53531a5a41")).toBe("stefan.almgren@sabygg.nu");
  });
  it("gives null for something that is not a protected address", () => {
    expect(decodeCfEmail("zz")).toBeNull();
    expect(decodeCfEmail("00ff11")).toBeNull();
  });
});

describe("revealCloudflareEmails", () => {
  it("turns a protected link and its placeholder text into a mailto link and the address", () => {
    const html = `<a href="/cdn-cgi/l/email-protection#3447405152555a1a5558595346515a744755564d53531a5a41" class="x"><span class="__cf_email__" data-cfemail="3447405152555a1a5558595346515a744755564d53531a5a41">[email&#160;protected]</span></a>`;
    const out = revealCloudflareEmails(html);
    expect(out).toContain('href="mailto:stefan.almgren@sabygg.nu"');
    expect(out).toContain("stefan.almgren@sabygg.nu");
    expect(out).not.toContain("protected");
  });
});

describe("revealTextEmails", () => {
  it("reads the common spelled-out forms", () => {
    expect(revealTextEmails("anna [at] foretag [dot] se")).toBe("anna@foretag.se");
    expect(revealTextEmails("anna (at) foretag.se")).toBe("anna@foretag.se");
    expect(revealTextEmails("anna snabel-a foretag.se")).toBe("anna@foretag.se");
    expect(revealTextEmails("Mejla anna @ foretag.se idag")).toBe("Mejla anna@foretag.se idag");
  });
  it("leaves ordinary text alone", () => {
    expect(revealTextEmails("Vi finns @ Instagram och på nätet")).toBe("Vi finns @ Instagram och på nätet");
  });
});

describe("condensePage on a real person-card layout", () => {
  const c = condensePage(fixture, "https://www.sabygg.nu/kontakt");

  it("keeps name and role on their own lines, next to the image marker", () => {
    expect(c.text).toContain("Stefan Almgren\nVD/Byggledning/Kalkyl");
    expect(c.text).toContain("Mikael Larsson\nAC/Projektledare Göteborg");
    expect(c.text.split("\n").filter((l) => l.startsWith("[bild "))).toHaveLength(3);
  });
  it("lists the images by number with absolute addresses, and skips nothing that is a photo", () => {
    expect(c.images.map((i) => i.index)).toEqual([1, 2, 3]);
    expect(c.images[0].url).toBe("https://www.sabygg.nu/wp-content/uploads/2021/07/stefan.jpg");
  });
  it("decodes the hidden addresses and normalises the phone numbers", () => {
    expect(c.emails).toEqual(expect.arrayContaining(["stefan.almgren@sabygg.nu", "mikael.larsson@sabygg.nu", "tommy.engbage@sabygg.nu"]));
    expect(c.phones).toEqual(expect.arrayContaining(["+46736375111", "+46709808484", "+46725615111"]));
    expect(c.text).toContain("[tel: +46736375111]");
    expect(c.text).toContain("[mail: stefan.almgren@sabygg.nu]");
  });
  it("drops the navigation, and keeps the footer's switchboard number", () => {
    expect(c.text).not.toContain("Hem");
    expect(c.phones).toContain("+46331234567");
  });
  it("gives the same fingerprint for the same text and a different one when it changes", () => {
    expect(condensePage(fixture, "https://www.sabygg.nu/kontakt").hash).toBe(c.hash);
    expect(condensePage(fixture.replace("Stefan Almgren", "Stefan Almgren Jr"), "https://www.sabygg.nu/kontakt").hash).not.toBe(c.hash);
  });
});

describe("condensePage images", () => {
  const html = `<body><img src="/logo.png" alt="Logotyp"><img src="/team/anna.jpg" alt="Anna" width="300" height="300"><img src="/ikon.png" width="20" height="20"><img data-src="/team/bo.webp" alt="">
    <img src="data:image/gif;base64,xx"><img src="/team/anna.jpg" alt="Anna igen"><img src="/line.svg"></body>`;
  it("skips logos, tiny icons, data URIs, svg and repeats, and reads lazy-loaded images", () => {
    const c = condensePage(html, "https://foretag.se/om-oss/");
    expect(c.images.map((i) => i.url)).toEqual(["https://foretag.se/team/anna.jpg", "https://foretag.se/team/bo.webp"]);
    expect(c.text).toContain("[bild 1: Anna]");
    expect(c.text).toContain("[bild 2]");
  });
});

describe("condensePage on a plain contact page", () => {
  it("keeps visible text and finds a spelled-out address", () => {
    const c = condensePage(`<body><h1>Kontakt</h1><p>Mejla Anna på anna [at] foretag [dot] se eller ring <a href="tel:+46 70 123 45 67">070-123 45 67</a></p></body>`, "https://foretag.se/kontakt");
    expect(c.emails).toContain("anna@foretag.se");
    expect(c.phones).toContain("+46701234567");
    expect(c.text).toContain("anna@foretag.se");
  });
});
