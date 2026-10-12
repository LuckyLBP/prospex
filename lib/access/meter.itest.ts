import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db";
import { LIMITS } from "./limits";
import { checkRate, releaseCompanies } from "./meter";
import { accessReport } from "./report";

const L = { ...LIMITS, dailyViews: 5, minuteViews: 3, searchPerMinute: 2 };
let user = "", org = "", companies: string[] = [];

const cleanup = async () => {
  await pool.query(`delete from access_log where user_id in (select user_id from profiles where email like 'zz-access-%')`);
  await pool.query(`delete from contacts where org_id in (select id from organizations where slug = 'zz-access-org')`);
  await pool.query(`delete from companies where dedupe_key like 'zz-access:%'`);
  await pool.query(`delete from organizations where slug = 'zz-access-org'`);
  await pool.query(`delete from profiles where email like 'zz-access-%'`);
  await pool.query(`delete from auth.users where email like 'zz-access-%'`);
};
beforeEach(async () => {
  await cleanup();
  user = (await pool.query(`insert into auth.users (id, email, instance_id, aud, role) values (gen_random_uuid(), 'zz-access-1@test.se', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated') returning id`)).rows[0].id;
  await pool.query(`insert into profiles (user_id, email) values ($1, 'zz-access-1@test.se')`, [user]);
  org = (await pool.query(`insert into organizations (name, slug) values ('Zz Access', 'zz-access-org') returning id`)).rows[0].id;
  companies = (await pool.query(`insert into companies (dedupe_key, name, first_seen_at, last_seen_at) select 'zz-access:' || g, 'Bolag ' || g, now(), now() from generate_series(1, 8) g returning id`)).rows.map((r) => r.id);
});
afterAll(async () => { await cleanup(); await pool.end(); });

describe("releaseCompanies", () => {
  it("counts a company once a day, stops at the per-minute limit, and keeps showing the ones already seen", async () => {
    const who = { userId: user, orgId: org };
    const a = await releaseCompanies(who, companies.slice(0, 5), L);
    expect(a.allowed).toHaveLength(3);
    expect(a.reason).toBe("minute");
    const again = await releaseCompanies(who, companies.slice(0, 3), L);
    expect(again.allowed).toHaveLength(3);
    expect(again.counted).toEqual([]);
    expect((await pool.query(`select count(*)::int n from access_log where user_id = $1 and kind = 'view'`, [user])).rows[0].n).toBe(3);
  });
  it("applies the daily limit across minutes", async () => {
    const who = { userId: user, orgId: org };
    await releaseCompanies(who, companies.slice(0, 3), L);
    await pool.query(`update access_log set at = now() - interval '5 minutes' where user_id = $1`, [user]);
    const b = await releaseCompanies(who, companies.slice(3, 8), L);
    expect(b.allowed).toHaveLength(2);
    expect(b.reason).toBe("daily");
    expect(b.usedToday).toBe(5);
  });
  it("lets the company's own contacts through without counting them", async () => {
    await pool.query(`insert into contacts (org_id, company_id) select $1, c from unnest($2::uuid[]) c`, [org, companies.slice(0, 6)]);
    const r = await releaseCompanies({ userId: user, orgId: org }, companies.slice(0, 6), L);
    expect(r.allowed).toHaveLength(6);
    expect(r.counted).toEqual([]);
  });
  it("does not limit a platform admin, but logs what was released", async () => {
    const r = await releaseCompanies({ userId: user, orgId: org, isAdmin: true }, companies, L);
    expect(r.allowed).toHaveLength(8);
    expect((await pool.query(`select count(*)::int n from access_log where user_id = $1 and kind = 'view'`, [user])).rows[0].n).toBe(8);
  });
});

describe("checkRate", () => {
  it("allows searches up to the limit per minute and then asks to wait", async () => {
    const who = { userId: user, orgId: org };
    expect(await checkRate(who, "search", L)).toEqual({ ok: true });
    expect(await checkRate(who, "search", L)).toEqual({ ok: true });
    expect(await checkRate(who, "search", L)).toEqual({ ok: false, retryAfterSec: 60 });
    expect(await checkRate(who, "list", L)).toEqual({ ok: true });
  });
});

describe("accessReport", () => {
  it("shows views today, over seven days, the peak minute and searches for a user", async () => {
    const who = { userId: user, orgId: org };
    await releaseCompanies(who, companies.slice(0, 3), L);
    await pool.query(`insert into access_log (user_id, org_id, kind, company_id, at) select $1, $2, 'view', c, now() - interval '3 days' from unnest($3::uuid[]) c`, [user, org, companies.slice(3, 8)]);
    await checkRate(who, "search", L);
    const row = (await accessReport()).find((r) => r.user_id === user)!;
    expect(row).toMatchObject({ email: "zz-access-1@test.se", today: 3, week: 8, peak_minute: 5, searches_24h: 1 });
  });
});
