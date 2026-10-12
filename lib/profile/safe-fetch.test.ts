import { describe, expect, it } from "vitest";
import { guardedLookup, PageBudget, readBytesCapped, safeFetch, safeFetchBytes } from "./safe-fetch";

describe("PageBudget", () => {
  it("allows eight pages in all and four chosen by the model", () => {
    const b = new PageBudget();
    for (let i = 0; i < 4; i++) expect(b.take("model")).toBe(true);
    expect(b.take("model")).toBe(false);
    for (let i = 0; i < 4; i++) expect(b.take("code")).toBe(true);
    expect(b.take("code")).toBe(false);
    expect(b.used).toBe(8);
    expect(b.byModel).toBe(4);
  });
  it("does not spend budget on a refused model page", () => {
    const b = new PageBudget(8, 1);
    b.take("model");
    b.take("model");
    expect(b.used).toBe(1);
  });
});

describe("safeFetch refuses before touching the network", () => {
  it("rejects a page outside the boundary without spending budget", async () => {
    const b = new PageBudget();
    const r = await safeFetch("https://evil.com/x", "example.se", b);
    expect(r).toMatchObject({ html: null, status: 0, problem: expect.stringContaining("utanför") });
    expect(b.used).toBe(0);
  });
  it("rejects an IP address, a non-http scheme and an unusual port", async () => {
    const b = new PageBudget();
    for (const u of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8080/", "file:///etc/passwd", "https://example.se:8443/"]) {
      expect((await safeFetch(u, "example.se", b)).html, u).toBeNull();
    }
    expect(b.used).toBe(0);
  });
  it("says so when the budget is gone", async () => {
    const b = new PageBudget(0, 0);
    expect(await safeFetch("https://example.se/", "example.se", b)).toMatchObject({ problem: "Gränsen för antal sidor är nådd." });
  });
});

describe("guardedLookup", () => {
  it("refuses a name that resolves to a loopback address", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup("localhost", {}, (e) => resolve(e)));
    expect(err?.code).toBe("EBLOCKED");
  });
  it("refuses a name that resolves to loopback when asked for all addresses", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup("localhost", { all: true }, (e) => resolve(e)));
    expect(err?.code).toBe("EBLOCKED");
  });
});

describe("safeFetch and a name that points at this machine", () => {
  it("is stopped at the lookup, not by the URL check", async () => {
    // "localhost" är ett värdnamn och går förbi isAllowedUrl, men dess adress är loopback.
    const r = await safeFetch("http://localhost/", "localhost", new PageBudget());
    expect(r.html).toBeNull();
    expect(r.problem).toContain("inte en offentlig adress");
  });
});

describe("readBytesCapped", () => {
  const response = (chunks: number[][]) => new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(new Uint8Array(ch)); c.close(); } }));
  it("returns everything when it fits", async () => {
    expect([...(await readBytesCapped(response([[1, 2], [3]]), 10))!]).toEqual([1, 2, 3]);
  });
  it("gives up, with null, when the body is bigger than the cap, and stops reading", async () => {
    expect(await readBytesCapped(response([[1, 2, 3], [4, 5, 6]]), 5)).toBeNull();
  });
  it("gives null for a response without a body", async () => {
    expect(await readBytesCapped(new Response(null), 10)).toBeNull();
  });
});

describe("safeFetchBytes refuses before and at the network", () => {
  it("rejects addresses that are not public web addresses, without any request", async () => {
    for (const u of ["http://127.0.0.1/l.png", "http://169.254.169.254/latest", "file:///etc/passwd", "http://localhost/l.png", "https://user:pw@example.com/l.png", "https://example.com:8443/l.png"]) {
      expect(await safeFetchBytes(u), u).toMatchObject({ ok: false, bytes: null, problem: expect.stringContaining("offentlig") });
    }
  });
  it("is stopped at the lookup for names that point at this machine", async () => {
    for (const host of ["localtest.me", "127.0.0.1.nip.io", "169.254.169.254.nip.io"]) {
      const r = await safeFetchBytes(`http://${host}/logo.png`);
      expect(r.ok, host).toBe(false);
      expect(r.problem, host).toContain("inte en offentlig adress");
    }
  });
});
