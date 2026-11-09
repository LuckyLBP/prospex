import { describe, expect, it, vi } from "vitest";
import { hackerTargetReverseIp, parseReverseIp, reverseIp } from "./hackertarget";

const ctx = { signal: new AbortController().signal, log: () => {} };
const text = (body: string, status = 200) => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

describe("parseReverseIp", () => {
  it("reads one domain per line and drops duplicates and junk", () => {
    expect(parseReverseIp("skogma.se\nwww.musikanten.nu\n\nskogma.se\n")).toEqual(["skogma.se", "musikanten.nu"]);
  });
  it("treats 'no records' as an empty list, not an error", () => {
    expect(parseReverseIp("No DNS A records found")).toEqual([]);
  });
  it("throws on the quota message and on an error line", () => {
    expect(() => parseReverseIp("API count exceeded - Increase Quota with Membership")).toThrow(/kvot/);
    expect(() => parseReverseIp("error check your search parameter")).toThrow(/HackerTarget/);
  });
});

describe("hackerTargetReverseIp", () => {
  it("refuses anything but an IPv4 address before calling out", async () => {
    const f = text("x");
    await expect(hackerTargetReverseIp("a.se&q=1", ctx.signal, f)).rejects.toThrow(/IPv4/);
    expect(f).not.toHaveBeenCalled();
  });
  it("fails clearly on an HTTP error", async () => {
    await expect(hackerTargetReverseIp("1.2.3.4", ctx.signal, text("x", 503))).rejects.toThrow(/503/);
  });
});

describe("reverseIp", () => {
  it("uses HackerTarget when there is no ViewDNS key", async () => {
    const r = await reverseIp("1.2.3.4", ctx, { viewdns: { apiKey: undefined, fetch: vi.fn() as never }, fetch: text("a.se\nb.se") });
    expect(r).toEqual({ domains: ["a.se", "b.se"], source: "hackertarget" });
  });
  it("falls back to HackerTarget when ViewDNS answers 429", async () => {
    const viewdns = { apiKey: "k", fetch: text("", 429) };
    const r = await reverseIp("1.2.3.4", ctx, { viewdns, fetch: text("c.se") });
    expect(r).toEqual({ domains: ["c.se"], source: "hackertarget" });
  });
  it("keeps the ViewDNS answer when it works", async () => {
    const viewdns = { apiKey: "k", fetch: text(JSON.stringify({ response: { domains: [{ name: "d.se" }], domain_count: "1" } })) };
    const ht = text("never.se");
    const r = await reverseIp("1.2.3.4", ctx, { viewdns, fetch: ht });
    expect(r).toEqual({ domains: ["d.se"], source: "viewdns" });
    expect(ht).not.toHaveBeenCalled();
  });
});
