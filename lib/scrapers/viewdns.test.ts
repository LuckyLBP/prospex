import { describe, expect, it } from "vitest";
import { extractDomains, isComplete, parseIpHistory, totalPages } from "./viewdns";

// The three endpoints answer in three shapes. Getting one wrong produces an
// empty run rather than an error, so each shape is pinned here.

describe("parseIpHistory", () => {
  it("reads iphistory's records[], skipping rows without a plain IPv4 address", () => {
    const body = { response: { records: [{ ip: "65.20.114.37", lastseen: "2026-10-20", owner: "AS-CHOOPA" }, { ip: "172.105.250.144", lastseen: "2025-03-24" }, { ip: "not-an-ip" }, { lastseen: "2020-01-01" }] } };
    expect(parseIpHistory(body)).toEqual([{ ip: "65.20.114.37", lastSeen: "2026-10-20" }, { ip: "172.105.250.144", lastSeen: "2025-03-24" }]);
    expect(parseIpHistory({})).toEqual([]);
  });
});

describe("extractDomains", () => {
  it("reads reverseip's domains[].name", () => {
    const body = {
      query: { tool: "reverseip_PRO", host: "1.2.3.4" },
      response: {
        domain_count: "2",
        domains: [
          { name: "salong.se", last_resolved: "2026-08-01" },
          { name: "klinik.se", last_resolved: "2026-08-02" },
        ],
      },
    };
    expect(extractDomains("reverseip", body)).toEqual(["salong.se", "klinik.se"]);
  });

  it("reads reversens's domains[].domain -- a different field in the same list", () => {
    const body = {
      response: { domain_count: "1", domains: [{ domain: "example.se" }] },
    };
    expect(extractDomains("reversens", body)).toEqual(["example.se"]);
    // The reverseip mapping would find nothing here, which is the bug this
    // table exists to prevent.
    expect(extractDomains("reverseip", body)).toEqual([]);
  });

  it("reads reversewhois's matches[].domain -- a different list entirely", () => {
    const body = {
      response: {
        result_count: "1",
        total_pages: "1",
        matches: [{ domain: "chibrary.com", created_date: "2011-11-13", registrar: "NAME.COM" }],
      },
    };
    expect(extractDomains("reversewhois", body)).toEqual(["chibrary.com"]);
  });

  it("survives an empty or malformed response", () => {
    expect(extractDomains("reverseip", {})).toEqual([]);
    expect(extractDomains("reverseip", { response: {} })).toEqual([]);
    expect(extractDomains("reverseip", { response: { domains: [{ name: "" }, {}] } })).toEqual([]);
  });
});

describe("totalPages", () => {
  it("parses the count, which arrives as a string", () => {
    expect(totalPages({ response: { total_pages: "3" } })).toBe(3);
    expect(totalPages({ response: { total_pages: 3 } })).toBe(3);
  });

  it("returns null when the endpoint does not report one", () => {
    expect(totalPages({ response: {} })).toBeNull();
    expect(totalPages({})).toBeNull();
    expect(totalPages({ response: { total_pages: "nope" } })).toBeNull();
  });
});

describe("isComplete", () => {
  it("is true when the page carried every domain the response counted", () => {
    expect(isComplete({ response: { domain_count: "2093" } }, 2093)).toBe(true);
  });

  it("is false when the page carried fewer than the count", () => {
    expect(isComplete({ response: { domain_count: "2093" } }, 500 )).toBe(false);
  });

  it("is false when the endpoint sends no count at all", () => {
    expect(isComplete({ response: {} }, 500)).toBe(false);
  });
});
