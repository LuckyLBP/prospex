import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { defaultLogoDeps, resolveLogo, type LogoDeps } from "./logos";
import { defaultNetworkDeps, buildNetwork } from "./network";
import { getPresence } from "./presence";

const SRC = "zz-net-itest-src";
const LIST = "zz-net-itest-list";
const HIDDEN = "zz-net-itest-hidden";
const DOMAIN = "zz-net-itest.se";
let companyId = "";

async function clean() {
  await pool.query(`delete from suppliers where slug = any($1)`, [[SRC, LIST, HIDDEN]]);
  await pool.query(`delete from companies where dedupe_key = 'zz-net-itest-co'`);
  await pool.query(`delete from web_logos where domain like 'zz-net-itest%'`);
  await pool.query(`delete from list_categories where slug = 'zz-net-itest-kat'`);
}
beforeAll(async () => {
  await clean();
  const cat = (await pool.query(`insert into list_categories (slug, name, names_brand, sort) values ('zz-net-itest-kat', 'Testbransch', false, 99) returning id`)).rows[0].id;
  await pool.query(`insert into suppliers (id, slug, name, kind, published, logo_path, domain) values (gen_random_uuid(), $1, 'Testkälla', 'supplier', true, 'testkalla.png', $2)`, [SRC, DOMAIN]);
  await pool.query(`insert into suppliers (id, slug, name, kind, published, category_id) values (gen_random_uuid(), $1, 'Testlista', 'list', true, $2)`, [LIST, cat]);
  await pool.query(`insert into suppliers (id, slug, name, kind, published) values (gen_random_uuid(), $1, 'Dold källa', 'supplier', false)`, [HIDDEN]);
  companyId = (await pool.query(`insert into companies (dedupe_key, domain, name) values ('zz-net-itest-co', 'zz-net-itest-co.se', 'Nätverks AB') returning id`)).rows[0].id;
  for (const [slug, url, seen] of [[LIST, null, "2026-10-01"], [SRC, "https://testkalla.se/foretag/1", "2026-10-05"], [HIDDEN, "https://dold.se", "2026-10-09"]] as const) {
    await pool.query(`insert into company_signals (company_id, supplier_id, source_url, first_seen_at, last_seen_at) values ($1, (select id from suppliers where slug = $2), $3, $4, $4)`, [companyId, slug, url, seen]);
  }
});
afterAll(async () => {
  await clean();
  await pool.end();
});

describe("getPresence", () => {
  it("lists published sources with their page, suppliers before lists, and leaves out unpublished ones", async () => {
    const p = await getPresence(companyId);
    expect(p.map((x) => x.slug)).toEqual([SRC, LIST]);
    expect(p[0]).toMatchObject({ name: "Testkälla", kind: "supplier", logoPath: "testkalla.png", namesBrand: true, sourceUrl: "https://testkalla.se/foretag/1" });
    expect(p[1]).toMatchObject({ kind: "list", category: "Testbransch", namesBrand: false, sourceUrl: null });
    expect(p[0].firstSeen).toMatch(/^2026-10-05/);
  });
  it("includes unpublished sources for admin, marked as unpublished", async () => {
    const all = await getPresence(companyId, { includeUnpublished: true });
    expect(all.map((x) => [x.slug, x.published])).toEqual([[HIDDEN, false], [SRC, true], [LIST, true]]);
  });
  it("is empty for a company in no source, and for no company", async () => {
    expect(await getPresence("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(await getPresence(null)).toEqual([]);
  });
});

describe("resolveLogo against the real catalog and cache", () => {
  const noNetwork: Partial<LogoDeps> = {
    fetchHome: async () => { throw new Error("ska inte hämta"); },
    fetchBytes: (async () => { throw new Error("ska inte hämta"); }) as never,
    upload: async () => { throw new Error("ska inte ladda upp"); },
  };
  it("reuses the logo of the source that has the same domain", async () => {
    expect(await resolveLogo({ name: "Något annat", domain: DOMAIN }, { ...defaultLogoDeps, ...noNetwork })).toEqual({ path: "testkalla.png", source: "supplier", supplierSlug: SRC });
  });
  it("matches a source on its name when the domain is unknown", async () => {
    expect((await resolveLogo({ name: "Testkälla", domain: "annan-domän.se" }, { ...defaultLogoDeps, ...noNetwork })).supplierSlug).toBe(SRC);
  });
  it("ignores an unpublished source", async () => {
    expect((await resolveLogo({ name: "Dold källa", domain: null }, { ...defaultLogoDeps, ...noNetwork })).supplierSlug).toBeNull();
  });
  it("caches a fetched logo, and a miss, in web_logos", async () => {
    const fetched: LogoDeps = { ...defaultLogoDeps, findSupplier: async () => null, fetchHome: async (d) => ({ html: `<link rel="apple-touch-icon" href="/a.png">`, finalUrl: `https://${d}/` }), fetchBytes: (async (u: string) => ({ ok: true, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(400).fill(1)]), contentType: "image/png", finalUrl: u, problem: null })) as never, upload: async (n) => `${n}-1.png` };
    expect(await resolveLogo({ domain: "zz-net-itest-a.se" }, fetched)).toMatchObject({ path: "web-zz-net-itest-a.se-1.png", source: "fetched" });
    expect(await resolveLogo({ domain: "zz-net-itest-a.se" }, { ...fetched, ...noNetwork, findSupplier: async () => null })).toMatchObject({ path: "web-zz-net-itest-a.se-1.png", source: "cache" });
    const miss: LogoDeps = { ...fetched, fetchHome: async () => null };
    expect((await resolveLogo({ domain: "zz-net-itest-b.se" }, miss)).source).toBe("none");
    expect((await pool.query(`select path from web_logos where domain = 'zz-net-itest-b.se'`)).rows[0]).toEqual({ path: null });
    expect((await resolveLogo({ domain: "zz-net-itest-b.se" }, { ...fetched, ...noNetwork, findSupplier: async () => null })).source).toBe("none");
  });
});

describe("buildNetwork against the real database", () => {
  it("finds which linked platforms are sources of ours by domain, and our own presence", async () => {
    const n = await buildNetwork(
      { creator: null, siteDomain: null, companyName: null, companyId, platformLinks: [{ domain: DOMAIN, name: "Testkälla", kind: "Katalog", url: `https://${DOMAIN}/x` }, { domain: "okand.se", name: "Okänd", kind: "Katalog", url: "https://okand.se" }] },
      defaultNetworkDeps,
    );
    expect(n.platformLinks.map((p) => [p.name, p.supplierSlug])).toEqual([["Testkälla", SRC], ["Okänd", null]]);
    // Profilen är för admin, så även den opublicerade källan ingår.
    expect(n.presence.map((p) => p.slug)).toEqual([HIDDEN, SRC, LIST]);
  });
});
