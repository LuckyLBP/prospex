import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db";
import { upsertCompany } from "../companies/upsert";
import { parseProfileInput } from "./input";
import { DEAD_ERROR, failProfile, finishProfile, getProfile, markRunning, MAX_RUNNING, ProfileStartError, recentProfiles, requeueProfile, setStage, startProfile, sweepDeadProfiles } from "./store";

const DOMAINS = ["zz-profil-itest-a.se", "zz-profil-itest-b.se", "zz-profil-itest-c.se", "zz-profil-itest-d.se"];
const KEYS = [...DOMAINS, "zz-profil-itest-key", "zz-profil-itest-key2"];

function url(d: string) {
  const p = parseProfileInput(d);
  if (p.kind !== "url") throw new Error("fel testdata");
  return p;
}
const by = { id: null as string | null };

afterAll(async () => {
  await pool.query(`delete from company_profiles where domain = any($1) or input like 'zz-profil-itest%' or orgnr like '670406-%'`, [DOMAINS]);
  await pool.query(`delete from companies where dedupe_key = any($1)`, [KEYS]);
  await pool.end();
});

beforeEach(async () => {
  await pool.query(`delete from company_profiles where domain = any($1) or orgnr like '670406-%'`, [DOMAINS]);
});

describe("startProfile", () => {
  it("creates a queued profile and reuses a running one for the same site", async () => {
    const a = await startProfile(url(DOMAINS[0]), by);
    expect(a.reused).toBe(false);
    await markRunning(a.id);
    const again = await startProfile(url(DOMAINS[0]), by);
    expect(again).toEqual({ id: a.id, reused: true });
  });

  it("reuses a profile that finished a moment ago, but not one that finished long ago", async () => {
    const a = await startProfile(url(DOMAINS[1]), by);
    await markRunning(a.id);
    await finishProfile(a.id, { companyId: null, name: "B", orgnr: null, domain: DOMAINS[1], profile: {}, facts: [], pages: [], model: null, inputTokens: null, outputTokens: null, steps: null, durationMs: 5, warnings: [] });
    expect((await startProfile(url(DOMAINS[1]), by)).reused).toBe(true);
    await pool.query(`update company_profiles set finished_at = now() - interval '5 minutes' where id = $1`, [a.id]);
    expect((await startProfile(url(DOMAINS[1]), by)).reused).toBe(false);
  });

  it("never merges sole traders, because the masked number is shared by everyone born the same day", async () => {
    const sole = parseProfileInput("670406-1230");
    if (sole.kind !== "orgnr") throw new Error("fel testdata");
    const a = await startProfile(sole, by);
    const b = await startProfile(sole, by);
    expect(a.id).not.toBe(b.id);
    const row = await getProfile(a.id);
    expect(row).toMatchObject({ orgnr: "670406-****", sole_trader: true, input: "670406-****" });
    const dump = await pool.query(`select * from company_profiles where id = $1`, [a.id]);
    expect(JSON.stringify(dump.rows[0])).not.toContain("1230");
  });

  it("refuses to start more than the allowed number of builds at once", async () => {
    const ids: string[] = [];
    const running = (await pool.query(`select count(*)::int n from company_profiles where status in ('queued','running')`)).rows[0].n as number;
    for (let i = 0; i < MAX_RUNNING - running; i++) ids.push((await startProfile(url(DOMAINS[i % 3]).domain === DOMAINS[0] ? url(DOMAINS[0]) : url(DOMAINS[i % 3]), by)).id);
    const extra = parseProfileInput(DOMAINS[3]);
    if (extra.kind !== "url") throw new Error("fel testdata");
    if (running + ids.length >= MAX_RUNNING) await expect(startProfile(extra, by)).rejects.toMatchObject({ code: "BUSY" });
  });
});

describe("lifecycle", () => {
  it("moves through stages, finishes with a profile, and can be requeued but not while running", async () => {
    const { id } = await startProfile(url(DOMAINS[2]), by);
    await expect(requeueProfile(id, by)).rejects.toMatchObject({ code: "RUNNING" });
    await markRunning(id);
    await setStage(id, "website");
    expect(await getProfile(id)).toMatchObject({ status: "running", stage: "website" });
    await finishProfile(id, { companyId: null, name: "C AB", orgnr: null, domain: DOMAINS[2], profile: { version: 1 }, facts: [{ id: "F1" }], pages: [], model: "m", inputTokens: 10, outputTokens: 5, steps: 2, durationMs: 1234, warnings: ["w"] });
    const done = await getProfile(id);
    expect(done).toMatchObject({ status: "done", stage: null, name: "C AB", model: "m", input_tokens: 10, warnings: ["w"], profile: { version: 1 } });
    await requeueProfile(id, by);
    expect(await getProfile(id)).toMatchObject({ status: "queued", error: null, profile: { version: 1 } }); // den gamla profilen ligger kvar
  });

  it("records a failure, and sweeps a profile with no heartbeat for five minutes", async () => {
    const { id } = await startProfile(url(DOMAINS[3]), by);
    await markRunning(id);
    await pool.query(`update company_profiles set heartbeat_at = now() - interval '10 minutes' where id = $1`, [id]);
    expect(await sweepDeadProfiles()).toBeGreaterThanOrEqual(1);
    expect(await getProfile(id)).toMatchObject({ status: "error", error: DEAD_ERROR });
    await failProfile(id, "x".repeat(2000));
    expect((await getProfile(id))!.error!.length).toBe(1000);
  });

  it("lets the newest profile win when two rows end up on the same company", async () => {
    const company = await upsertCompany({ dedupeKey: "zz-profil-itest-key", domain: null, name: "Samma AB" });
    const a = await startProfile(url(DOMAINS[0]), by);
    const b = await startProfile(url(DOMAINS[1]), by);
    const base = { name: "Samma AB", orgnr: null, domain: null, profile: {}, facts: [], pages: [], model: null, inputTokens: null, outputTokens: null, steps: null, durationMs: 1, warnings: [] };
    await finishProfile(a.id, { ...base, companyId: company.id });
    await finishProfile(b.id, { ...base, companyId: company.id });
    expect(await getProfile(a.id)).toBeNull();
    expect(await getProfile(b.id)).toMatchObject({ company_id: company.id });
  });

  it("lists recent profiles without the heavy columns", async () => {
    await startProfile(url(DOMAINS[0]), by);
    const list = await recentProfiles(5);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).not.toHaveProperty("profile");
    expect(list[0]).not.toHaveProperty("facts");
  });
});

describe("upsertCompany", () => {
  it("fills blanks, never empties or replaces a known value, and flags a different org.nr", async () => {
    const first = await upsertCompany({ dedupeKey: "zz-profil-itest-key2", domain: null, name: "Första", phone: "+46700000009", orgnr: "556503-8212" });
    const second = await upsertCompany({ dedupeKey: "zz-profil-itest-key2", domain: DOMAINS[0], name: "Annat", phone: null, email: "a@b.se", orgnr: "556677-8899" });
    expect(second.id).toBe(first.id);
    const dates = (await pool.query(`select first_seen_at is not null as a, last_seen_at is not null as b from companies where id = $1`, [first.id])).rows[0];
    expect(dates).toEqual({ a: true, b: true });
    expect(second.orgnrConflict).toBe(true);
    const row = (await pool.query(`select name, phone, email, domain, orgnr from companies where id = $1`, [first.id])).rows[0];
    expect(row).toEqual({ name: "Första", phone: "+46700000009", email: "a@b.se", domain: DOMAINS[0], orgnr: "556503-8212" });
    await pool.query(`update companies set domain = null where id = $1`, [first.id]);
  });
});
