import { describe, expect, it } from "vitest";
import { normalizeDomain, websiteUrl } from "./domain";

describe("normalizeDomain", () => {
  it("strips scheme, www, path, port and case", () => {
    expect(normalizeDomain("https://WWW.Salong.se/boka?x=1")).toBe("salong.se");
    expect(normalizeDomain("http://example.com:8080/a/b")).toBe("example.com");
    expect(normalizeDomain("Example.COM")).toBe("example.com");
  });

  it("treats the same company written four ways as one domain", () => {
    const forms = ["salong.se", "www.salong.se", "https://salong.se/", "HTTP://WWW.Salong.se"];
    const normalised = new Set(forms.map(normalizeDomain));
    expect(normalised.size).toBe(1);
  });

  it("drops the DNS root's trailing dot", () => {
    expect(normalizeDomain("example.com.")).toBe("example.com");
  });

  it("keeps subdomains that are not www", () => {
    expect(normalizeDomain("https://shop.example.com")).toBe("shop.example.com");
  });

  it("rejects what is not a hostname", () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("two words.se")).toBeNull();
    expect(normalizeDomain("mailto:a@b.se")).toBeNull();
  });

  it("builds the canonical url", () => {
    expect(websiteUrl("salong.se")).toBe("https://salong.se");
  });
});
