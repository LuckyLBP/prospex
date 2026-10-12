import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../db";
import { LIMITS } from "./limits";
import { signCompanyId } from "./tokens";

let access: { user: { id: string }; org: { id: string }; isAdmin: boolean } | null = null;
vi.mock("@/lib/auth", () => ({ getAccessOrNull: async () => access }));
import { GET } from "@/app/api/dialer/cards/route";

let user = "", org = "", companies: string[] = [];
const cleanup = async () => {
  await pool.query(`delete from access_log where user_id in (select user_id from profiles where email like 'zz-route-%')`);
  await pool.query(`delete from companies where dedupe_key like 'zz-route:%'`);
  await pool.query(`delete from organizations where slug = 'zz-route-org'`);
  await pool.query(`delete from profiles where email like 'zz-route-%'`);
  await pool.query(`delete from auth.users where email like 'zz-route-%'`);
};
beforeEach(async () => {
  await cleanup();
  user = (await pool.query(`insert into auth.users (id, email, instance_id, aud, role) values (gen_random_uuid(), 'zz-route-1@test.se', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated') returning id`)).rows[0].id;
  await pool.query(`insert into profiles (user_id, email) values ($1, 'zz-route-1@test.se')`, [user]);
  org = (await pool.query(`insert into organizations (name, slug) values ('Zz Route', 'zz-route-org') returning id`)).rows[0].id;
  companies = (await pool.query(`insert into companies (dedupe_key, name, phone, first_seen_at, last_seen_at) select 'zz-route:' || g, 'Bolag ' || g, '+46800000' || g, now(), now() from generate_series(1, 6) g returning id`)).rows.map((r) => r.id);
  access = { user: { id: user }, org: { id: org }, isAdmin: false };
});
afterAll(async () => { await cleanup(); await pool.end(); });

const call = (ids: string[]) => GET(new NextRequest(`http://localhost/api/dialer/cards?ids=${ids.join(",")}`));
const signed = (ids: string[]) => ids.map((id) => `${id}.${signCompanyId(user, id)}`);

describe("GET /api/dialer/cards", () => {
  it("refuses a request without a session", async () => {
    access = null;
    expect((await call(signed(companies.slice(0, 1)))).status).toBe(401);
  });
  it("refuses ids without a signature, with a wrong one, or signed for someone else, and releases nothing", async () => {
    expect((await call(companies.slice(0, 2))).status).toBe(403);
    expect((await call([`${companies[0]}.${"a".repeat(22)}`])).status).toBe(403);
    const other = "99999999-9999-9999-9999-999999999999";
    expect((await call([`${companies[0]}.${signCompanyId(other, companies[0])}`])).status).toBe(403);
    expect((await pool.query(`select count(*)::int n from access_log where user_id = $1`, [user])).rows[0].n).toBe(0);
  });
  it("returns cards for signed ids and logs them", async () => {
    const res = await call(signed(companies.slice(0, 3)));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: { id: string; phone: string }[]; limited: unknown };
    expect(body.cards.map((c) => c.id)).toEqual(companies.slice(0, 3));
    expect(body.cards[0].phone).toMatch(/^\+46800000/);
    expect(body.limited).toBeNull();
    expect((await pool.query(`select count(distinct company_id)::int n from access_log where user_id = $1 and kind = 'view'`, [user])).rows[0].n).toBe(3);
  });
  it("answers 429 with a message once the per-minute limit is used up", async () => {
    // Fyller minutens gräns med andra företag, så att nästa begäran inte får plats.
    const filler = (await pool.query(`insert into companies (dedupe_key, name, first_seen_at, last_seen_at) select 'zz-route:f' || g, 'Fyll ' || g, now(), now() from generate_series(1, $1::int) g returning id`, [LIMITS.minuteViews])).rows.map((r) => r.id);
    await pool.query(`insert into access_log (user_id, org_id, kind, company_id) select $1, $2, 'view', c from unnest($3::uuid[]) c`, [user, org, filler]);
    const res = await call(signed(companies.slice(0, 2)));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "limit", reason: "minute" });
  });
});
