import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { claimCompany, getQueueIds, releaseClaims } from "./queue";
import { QUEUE_ORDERS } from "./order";

const ORG = "cccccccc-0000-0000-0000-000000000002";
const U1 = "dddddddd-0000-0000-0000-000000000011";
const U2 = "dddddddd-0000-0000-0000-000000000012";
const scope = { profileSlug: "roi", mode: "new" as const };

async function cleanup() {
  await pool.query(`delete from organizations where id = $1`, [ORG]);
  await pool.query(`delete from auth.users where id in ($1,$2)`, [U1, U2]);
}
beforeAll(async () => {
  await cleanup();
  await pool.query(`insert into organizations (id, name, slug) values ($1, 'IT Queue', 'it-queue')`, [ORG]);
  for (const [id, email] of [[U1, "q1@example.invalid"], [U2, "q2@example.invalid"]]) {
    await pool.query(`insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,now(),now())`, [id, email]);
  }
});
afterAll(async () => { await cleanup(); await pool.end(); });

describe("getQueueIds", () => {
  for (const o of QUEUE_ORDERS) {
    it(`builds a queue in the "${o.value}" order without errors`, async () => {
      const ids = await getQueueIds(ORG, U1, scope, o.value, 50);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }

  it("is stable for the same seller and day, and differs between sellers in the random order", async () => {
    const a1 = await getQueueIds(ORG, U1, scope, "slump", 30);
    const a2 = await getQueueIds(ORG, U1, scope, "slump", 30);
    const b = await getQueueIds(ORG, U2, scope, "slump", 30);
    expect(a2).toEqual(a1);
    expect(b).not.toEqual(a1);
  });

  it("leaves out a company another seller has open, but not their own", async () => {
    const ids = await getQueueIds(ORG, U1, scope, "namn", 5);
    const status = await claimCompany(ORG, U1, ids[0]);
    expect(status.claimed).toBe(true);
    expect(await getQueueIds(ORG, U2, scope, "namn", 5)).not.toContain(ids[0]);
    expect(await getQueueIds(ORG, U1, scope, "namn", 5)).toContain(ids[0]);
    const denied = await claimCompany(ORG, U2, ids[0]);
    expect(denied.claimed).toBe(false);
    await releaseClaims(ORG, U1);
    expect(await getQueueIds(ORG, U2, scope, "namn", 5)).toContain(ids[0]);
  });

  it("applies the city filter", async () => {
    const all = await getQueueIds(ORG, U1, scope, "namn", 500);
    const stockholm = await getQueueIds(ORG, U1, { ...scope, city: "STOCKHOLM" }, "namn", 500);
    expect(stockholm.length).toBeLessThan(all.length);
  });
});
