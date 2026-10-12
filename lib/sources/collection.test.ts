import { describe, expect, it } from "vitest";
import { collectionDefaults, readCollection } from "./collection";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";

describe("readCollection", () => {
  it("treats an empty method as no collection", () => {
    expect(readCollection(form({ enrich_sites: "on" }))).toEqual({ ok: true, method: null, config: {}, enrichSites: true });
  });
  it("parses PublicWWW and applies the default result cap", () => {
    expect(readCollection(form({ method: "publicwww", pww_query: ' "hello-swapi" ' }))).toMatchObject({ ok: true, method: "publicwww", config: { query: '"hello-swapi"', maxResults: 1000 }, enrichSites: false });
  });
  it("rejects a PublicWWW query that is too short, in Swedish", () => {
    expect(readCollection(form({ method: "publicwww", pww_query: "a" }))).toEqual({ ok: false, error: "Ange en sökfråga." });
  });
  it("parses ViewDNS and caps pages at 5", () => {
    expect(readCollection(form({ method: "viewdns", vd_endpoint: "reverseip", vd_target: "1.2.3.4", vd_pages: "5" }))).toMatchObject({ ok: true, config: { endpoint: "reverseip", target: "1.2.3.4", maxPages: 5 } });
    expect(readCollection(form({ method: "viewdns", vd_endpoint: "reverseip", vd_target: "1.2.3.4", vd_pages: "6" }))).toMatchObject({ ok: false });
    expect(readCollection(form({ method: "viewdns", vd_endpoint: "nope", vd_target: "x" }))).toMatchObject({ ok: false });
  });
  it("parses Google Places into the stored shape and reports the cost in requests", () => {
    const r = readCollection(form({ method: "googleplaces", gp_queries: "frisör\nfrisörsalong", gp_locations: "Stockholm\nMalmö\nLund", gp_pages: "2" }));
    expect(r).toMatchObject({ ok: true, method: "googleplaces", config: { queries: "frisör\nfrisörsalong", locations: "Stockholm\nMalmö\nLund", maxPages: 2 }, requests: 12 });
  });
  it("rejects Google Places without locations", () => {
    expect(readCollection(form({ method: "googleplaces", gp_queries: "x", gp_locations: "" }))).toEqual({ ok: false, error: "Ange minst en ort." });
  });
  it("requires domains for a domain list and a known script", () => {
    expect(readCollection(form({ method: "domainlist", dl_domains: "  " }))).toMatchObject({ ok: false });
    expect(readCollection(form({ method: "domainlist", dl_domains: "a.se\nb.se" }))).toMatchObject({ ok: true, config: { domains: "a.se\nb.se" } });
    expect(readCollection(form({ method: "script", script_key: "brabyggare" }))).toMatchObject({ ok: true, config: { script: "brabyggare" } });
    expect(readCollection(form({ method: "script", script_key: "nope" }))).toMatchObject({ ok: false });
  });
  it("rejects an unknown method", () => {
    expect(readCollection(form({ method: "scrapy" }))).toEqual({ ok: false, error: "Okänd insamlingsmetod." });
  });
});

describe("collectionDefaults", () => {
  it("round-trips a stored config into form values", () => {
    expect(collectionDefaults("publicwww", { query: "x", maxResults: 5000 })).toMatchObject({ method: "publicwww", pww_query: "x", pww_max: 5000 });
    expect(collectionDefaults("googleplaces", { queries: "a\r\nb", locations: "c", maxPages: 2 })).toMatchObject({ gp_queries: "a\nb", gp_locations: "c", gp_pages: 2 });
  });
  it("gives an empty method for a source without collection", () => {
    expect(collectionDefaults(null, {}).method).toBe("");
  });
});
