import { describe, expect, it } from "vitest";
import { boundaryOf, isAllowedPublicUrl, isAllowedUrl, isPublicAddress, withinBoundary } from "./safe-url";

describe("isPublicAddress", () => {
  it("accepts ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "185.189.49.130", "2606:4700:4700::1111", "2a00:1450:4001::200e"]) expect(isPublicAddress(ip), ip).toBe(true);
  });
  it("rejects private, loopback, link-local, CGNAT and reserved IPv4", () => {
    for (const ip of ["0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "198.18.0.1", "192.0.2.5", "224.0.0.1", "240.0.0.1", "255.255.255.255"]) expect(isPublicAddress(ip), ip).toBe(false);
  });
  it("keeps the edges of the 172.16/12 range honest", () => {
    expect(isPublicAddress("172.15.255.255")).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true);
  });
  it("rejects IPv6 loopback, unique-local, link-local and documentation ranges", () => {
    for (const ip of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1"]) expect(isPublicAddress(ip), ip).toBe(false);
  });
  it("judges IPv4 mapped into IPv6 as IPv4", () => {
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:7f00:1")).toBe(false);
    expect(isPublicAddress("::ffff:169.254.169.254")).toBe(false);
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });
  it("rejects anything that is not an IP address", () => {
    for (const s of ["", "localhost", "example.se", "999.1.1.1"]) expect(isPublicAddress(s), s).toBe(false);
  });
});

describe("withinBoundary", () => {
  it("allows the domain, www and subdomains, and nothing that only ends the same way", () => {
    expect(withinBoundary("example.se", "example.se")).toBe(true);
    expect(withinBoundary("www.example.se", "example.se")).toBe(true);
    expect(withinBoundary("shop.example.se", "www.example.se")).toBe(true);
    expect(withinBoundary("evilexample.se", "example.se")).toBe(false);
    expect(withinBoundary("example.se.evil.com", "example.se")).toBe(false);
    expect(withinBoundary("evil.com", "example.se")).toBe(false);
  });
  it("normalises case and trailing dots", () => {
    expect(boundaryOf("WWW.Example.SE.")).toBe("example.se");
    expect(withinBoundary("EXAMPLE.se.", "example.se")).toBe(true);
  });
});

describe("isAllowedUrl", () => {
  const B = "example.se";
  it("allows pages on the company's own site", () => {
    for (const u of ["https://example.se/", "http://www.example.se/om-oss", "https://shop.example.se:443/x?y=1", "https://example.se:80/"]) expect(isAllowedUrl(u, B), u).toBe(true);
  });
  it("rejects other schemes, userinfo and unusual ports", () => {
    for (const u of ["ftp://example.se/", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@example.se/", "https://example.se:8080/", "https://example.se:22/"]) expect(isAllowedUrl(u, B), u).toBe(false);
  });
  it("rejects other domains, lookalikes and IP-address hosts", () => {
    for (const u of ["https://evil.com/example.se", "https://example.se.evil.com/", "https://evilexample.se/", "http://localhost/", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://2130706433/", "http://0x7f.1/", "http://0177.0.0.1/"]) expect(isAllowedUrl(u, B), u).toBe(false);
  });
  it("rejects what is not a URL at all", () => {
    for (const u of ["", "not a url", "//example.se/x", "/om-oss"]) expect(isAllowedUrl(u, B), u).toBe(false);
  });
});

describe("isAllowedPublicUrl", () => {
  it("allows ordinary http and https addresses on any domain, such as a CDN", () => {
    for (const u of ["https://cdn.byra.se/logo.png", "http://example.com/a.png", "https://example.com:443/x", "https://img.example.co.uk/a?b=1"]) expect(isAllowedPublicUrl(u), u).toBe(true);
  });
  it("rejects IP addresses, local names, userinfo, other ports and other schemes", () => {
    for (const u of ["http://127.0.0.1/x.png", "http://169.254.169.254/", "http://[::1]/", "http://2130706433/", "http://localhost/x", "http://server.local/x", "http://intranet/x", "https://user:pw@example.com/", "https://example.com:8443/", "ftp://example.com/", "file:///etc/passwd", "data:image/png;base64,AAAA", "javascript:alert(1)", "", "/relativ"]) {
      expect(isAllowedPublicUrl(u), u).toBe(false);
    }
  });
});
