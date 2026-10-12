import { describe, expect, it } from "vitest";
import { resolveLogo, type LogoDeps } from "./logos";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(400).fill(1)]);
const HOME = `<html><head><link rel="apple-touch-icon" href="/apple.png"><link rel="icon" sizes="96x96" href="/icon.png"></head><body></body></html>`;

function deps(over: Partial<LogoDeps> & { log?: string[] } = {}): LogoDeps & { log: string[] } {
  const log = over.log ?? [];
  return {
    findSupplier: async () => { log.push("supplier"); return null; },
    getCached: async () => { log.push("cache"); return null; },
    saveCache: async (d, p) => { log.push(`save:${d}:${p}`); },
    fetchHome: async (d) => { log.push(`home:${d}`); return { html: HOME, finalUrl: `https://${d}/` }; },
    fetchBytes: (async (u: string) => { log.push(`bytes:${u}`); return { ok: true, bytes: PNG, contentType: "image/png", finalUrl: u, problem: null }; }) as never,
    upload: async (n) => { log.push(`upload:${n}`); return `${n}-1.png`; },
    now: () => 1_000_000_000_000,
    ...over,
    log,
  } as LogoDeps & { log: string[] };
}

describe("resolveLogo: the catalog first", () => {
  it("reuses the logo of a source with the same domain or name, without any request", async () => {
    const d = deps({ findSupplier: async () => ({ slug: "brabyggare", logo_path: "brabyggare-1.png" }) });
    expect(await resolveLogo({ name: "BraByggare", domain: "brabyggare.se" }, d)).toEqual({ path: "brabyggare-1.png", source: "supplier", supplierSlug: "brabyggare" });
    expect(d.log).toEqual([]);
  });
  it("remembers which source it is even when that source has no logo, and goes on to fetch one", async () => {
    const d = deps({ findSupplier: async () => ({ slug: "infront", logo_path: null }) });
    const r = await resolveLogo({ name: "Infront", domain: "infront.se" }, d);
    expect(r).toMatchObject({ source: "fetched", supplierSlug: "infront" });
  });
  it("does not look in the catalog when asked not to", async () => {
    const d = deps({ findSupplier: async () => ({ slug: "x", logo_path: "x.png" }) });
    expect((await resolveLogo({ name: "X", domain: "x.se", useCatalog: false }, d)).source).toBe("fetched");
  });
});

describe("resolveLogo: the cache", () => {
  const fresh = 1_000_000_000_000 - 60_000;
  it("uses a logo fetched a while ago, without another request", async () => {
    const d = deps({ getCached: async () => ({ path: "web-byra.se-1.png", fetchedAt: new Date(fresh) }) });
    expect(await resolveLogo({ domain: "byra.se" }, d)).toEqual({ path: "web-byra.se-1.png", source: "cache", supplierSlug: null });
    expect(d.log).toEqual(["supplier"]);
  });
  it("does not retry a recent miss, but does retry an old one, and refetches a stale hit", async () => {
    const miss = deps({ getCached: async () => ({ path: null, fetchedAt: new Date(fresh) }) });
    expect((await resolveLogo({ domain: "byra.se" }, miss)).source).toBe("none");
    expect(miss.log).toEqual(["supplier"]);
    const oldMiss = deps({ getCached: async () => ({ path: null, fetchedAt: new Date(1_000_000_000_000 - 8 * 24 * 3600 * 1000) }) });
    expect((await resolveLogo({ domain: "byra.se" }, oldMiss)).source).toBe("fetched");
    const staleHit = deps({ getCached: async () => ({ path: "gammal.png", fetchedAt: new Date(1_000_000_000_000 - 40 * 24 * 3600 * 1000) }) });
    expect((await resolveLogo({ domain: "byra.se" }, staleHit)).source).toBe("fetched");
  });
});

describe("resolveLogo: fetching from the site", () => {
  it("takes the first valid candidate, uploads it and caches it", async () => {
    const d = deps();
    const r = await resolveLogo({ domain: "WWW.Byra.se" }, d);
    expect(r).toEqual({ path: "web-byra.se-1.png", source: "fetched", supplierSlug: null });
    expect(d.log).toEqual(["supplier", "cache", "home:byra.se", "bytes:https://byra.se/apple.png", "upload:web-byra.se", "save:byra.se:web-byra.se-1.png"]);
  });
  it("skips candidates that are too small, not an image, or fail, and tries the next", async () => {
    const tiny = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
    const html = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, ...new Array(400).fill(65)]);
    const answers: Record<string, { ok: boolean; bytes: Uint8Array | null }> = { "https://byra.se/apple.png": { ok: true, bytes: tiny }, "https://byra.se/icon.png": { ok: true, bytes: html }, "https://byra.se/apple-touch-icon.png": { ok: true, bytes: PNG } };
    const d = deps({ fetchBytes: (async (u: string) => ({ ...(answers[u] ?? { ok: false, bytes: null }), contentType: "image/png", finalUrl: u, problem: null })) as never });
    expect((await resolveLogo({ domain: "byra.se" }, d)).source).toBe("fetched");
    expect(d.log).toContain("upload:web-byra.se");
  });
  it("remembers a miss, so the same site is not tried again at once", async () => {
    const d = deps({ fetchBytes: (async (u: string) => ({ ok: false, bytes: null, contentType: null, finalUrl: u, problem: "x" })) as never });
    expect(await resolveLogo({ domain: "byra.se" }, d)).toEqual({ path: null, source: "none", supplierSlug: null });
    expect(d.log).toContain("save:byra.se:null");
  });
  it("gives no logo, instead of failing, when the site does not load or something throws", async () => {
    expect((await resolveLogo({ domain: "byra.se" }, deps({ fetchHome: async () => null }))).source).toBe("none");
    expect((await resolveLogo({ domain: "byra.se" }, deps({ upload: async () => { throw new Error("lagringen nere"); } }))).source).toBe("none");
    expect((await resolveLogo({ domain: "byra.se" }, deps({ findSupplier: async () => { throw new Error("db"); }, getCached: async () => { throw new Error("db"); } }))).source).toBe("fetched");
  });
  it("tries at most five candidates", async () => {
    const links = Array.from({ length: 12 }, (_, i) => `<link rel="apple-touch-icon" href="/a${i}.png">`).join("");
    const log: string[] = [];
    const d = deps({ log, fetchHome: async () => ({ html: `<html><head>${links}</head></html>`, finalUrl: "https://byra.se/" }), fetchBytes: (async (u: string) => { log.push(`bytes:${u}`); return { ok: false, bytes: null, contentType: null, finalUrl: u, problem: "x" }; }) as never });
    await resolveLogo({ domain: "byra.se" }, d);
    expect(log.filter((l) => l.startsWith("bytes:"))).toHaveLength(5);
  });
  it("returns nothing for no domain and no name", async () => {
    expect(await resolveLogo({ domain: null }, deps())).toEqual({ path: null, source: "none", supplierSlug: null });
  });
});
