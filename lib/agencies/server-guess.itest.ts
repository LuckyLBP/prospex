import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { defaultGuessDeps, learnFromReview, linkServerToAgencyDomain, recordSiteIps } from "./server-guess";
import { ensureAgencySupplier } from "./store";

// Minnet i databasen: server_hosts, site_ips och hur en admins granskning lär servern. Egna testadresser (TEST-NET-1) och
// en testbyrå som städas bort efteråt.
const IP = "192.0.2.77";
const IP2 = "192.0.2.78";
const DOMAIN = "zz-server-itest.se";
const SLUG_DOMAIN = "zz-server-itest-agency.se";

async function clean() {
  await pool.query(`delete from server_hosts where ip = any($1)`, [[IP, IP2]]);
  await pool.query(`delete from site_ips where domain like 'zz-server-itest%'`);
  await pool.query(`delete from suppliers where domain = $1`, [SLUG_DOMAIN]);
}
beforeAll(clean);
afterAll(async () => {
  await clean();
  await pool.end();
});

describe("server memory", () => {
  it("stores a verdict and reads it back, and keeps one row per server", async () => {
    const { memory } = defaultGuessDeps;
    await memory.put({ ip: IP, siteCount: 12, verdict: "unclear", evidence: { reason: "För få." } });
    await memory.put({ ip: IP, siteCount: 130, verdict: "agency", agencyName: "Testbyrån", agencyDomain: SLUG_DOMAIN, evidence: { credited: 8, examples: ["a.se"], reason: "ok" } });
    const row = await memory.get(IP);
    expect(row).toMatchObject({ ip: IP, siteCount: 130, verdict: "agency", agencyName: "Testbyrån", agencyDomain: SLUG_DOMAIN });
    expect(row?.evidence).toMatchObject({ credited: 8, examples: ["a.se"] });
    expect((await pool.query(`select count(*)::int n from server_hosts where ip = $1`, [IP])).rows[0].n).toBe(1);
  });

  it("counts only paid lookups against the daily cap", async () => {
    const before = await defaultGuessDeps.memory.lookupsToday();
    await defaultGuessDeps.memory.put({ ip: IP2, siteCount: 0, verdict: "agency", agencyName: "X", agencyDomain: "x.se" });
    expect(await defaultGuessDeps.memory.lookupsToday()).toBe(before);
    await defaultGuessDeps.memory.put({ ip: IP2, siteCount: 50, verdict: "unclear" });
    expect(await defaultGuessDeps.memory.lookupsToday()).toBe(before + 1);
  });
});

describe("site_ips", () => {
  it("records which addresses a domain pointed at, and answers which sites share one", async () => {
    await recordSiteIps("zz-server-itest-a.se", [IP, "10.0.0.1", "not an ip"]);
    await recordSiteIps("zz-server-itest-b.se", [IP]);
    await recordSiteIps("zz-server-itest-a.se", [IP]);
    const siblings = await defaultGuessDeps.knownSiblings(IP);
    expect(siblings.sort()).toEqual(["zz-server-itest-a.se", "zz-server-itest-b.se"]);
    expect(await defaultGuessDeps.knownSiblings("10.0.0.1")).toEqual([]);
  });
});

describe("review learning", () => {
  it("links a server to the agency created for it, creates that agency unpublished, and learns from publishing and rejecting", async () => {
    await defaultGuessDeps.memory.put({ ip: IP, siteCount: 130, verdict: "agency", agencyName: "Testbyrån", agencyDomain: SLUG_DOMAIN });
    const source = await ensureAgencySupplier({ name: "Testbyrån", domain: SLUG_DOMAIN, foundVia: { ip: IP, sites: 130 } });
    const created = (await pool.query(`select published, config from suppliers where id = $1`, [source.id])).rows[0];
    expect(created.published).toBe(false);
    expect(created.config).toMatchObject({ foundVia: "server", serverIp: IP, serverSites: 130 });

    await linkServerToAgencyDomain(IP, SLUG_DOMAIN);
    expect((await defaultGuessDeps.memory.get(IP))?.confirmedAt).toBeNull();

    await learnFromReview({ supplierId: source.id }, "confirmed");
    const confirmed = await defaultGuessDeps.memory.get(IP);
    expect(confirmed).toMatchObject({ verdict: "agency" });
    expect(confirmed?.confirmedAt).not.toBeNull();

    await learnFromReview({ domain: SLUG_DOMAIN }, "rejected");
    expect(await defaultGuessDeps.memory.get(IP)).toMatchObject({ verdict: "host" });
  });

  it("keeps an admin's answer when the server is looked up again with the same verdict", async () => {
    await defaultGuessDeps.memory.put({ ip: IP, siteCount: 99, verdict: "host" });
    expect((await defaultGuessDeps.memory.get(IP))?.confirmedAt).not.toBeNull();
    await defaultGuessDeps.memory.put({ ip: IP, siteCount: 99, verdict: "unclear" });
    expect((await defaultGuessDeps.memory.get(IP))?.confirmedAt).toBeNull();
  });
});
