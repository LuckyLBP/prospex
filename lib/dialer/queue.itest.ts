import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { claimCompany, getQueueIds, releaseClaims } from "./queue";
import { QUEUE_ORDERS } from "./order";

const ORG = "cccccccc-0000-0000-0000-000000000002";
const U1 = "dddddddd-0000-0000-0000-000000000011";
const U2 = "dddddddd-0000-0000-0000-000000000012";
const scope = { sources: ["roi"], mode: "new" as const };

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

  describe("templates", () => {
    it("keeps never-called and no-answer companies apart, and together they make up the default list", async () => {
      const all = await getQueueIds(ORG, U1, scope, "namn", 500);
      const [a, b, c] = all;
      // a: ej svar i går (ska komma tillbaka), b: ej svar i dag (hanterat i dag), c: upptaget i går med återkomstdatum (inte i kön)
      await pool.query(`insert into contacts (org_id, company_id, outcome, last_called_at, call_count) values ($1,$2,'no_answer', now() - interval '1 day', 1)`, [ORG, a]);
      await pool.query(`insert into contacts (org_id, company_id, outcome, last_called_at, call_count) values ($1,$2,'no_answer', now(), 1)`, [ORG, b]);
      await pool.query(`insert into contacts (org_id, company_id, outcome, last_called_at, next_callback_at, call_count) values ($1,$2,'busy', now() - interval '1 day', now() + interval '2 days', 1)`, [ORG, c]);

      const fresh = await getQueueIds(ORG, U1, { ...scope, template: "fresh" }, "namn", 500);
      const noanswer = await getQueueIds(ORG, U1, { ...scope, template: "noanswer" }, "namn", 500);
      const def = await getQueueIds(ORG, U1, scope, "namn", 500);

      expect(noanswer).toEqual([a]);
      expect(fresh).not.toContain(a);
      expect([b, c].some((id) => fresh.includes(id) || noanswer.includes(id) || def.includes(id))).toBe(false);
      expect(fresh.length).toBeGreaterThan(0);
      expect([...fresh, ...noanswer].sort()).toEqual([...def].sort());
      // I standardlistan kommer de som inte svarade före de oringda (så har kön alltid sorterat)
      expect(def.indexOf(a)).toBe(0);
    });
  });

  describe("several sources", () => {
    it("takes companies from any of the chosen sources, and ignores unknown ones", async () => {
      const slugs = (await pool.query(`select slug from suppliers where published order by slug limit 3`)).rows.map((r) => r.slug as string);
      const [a, b] = slugs;
      const onlyA = await getQueueIds(ORG, U1, { ...scope, sources: [a] }, "namn", 500);
      const onlyB = await getQueueIds(ORG, U1, { ...scope, sources: [b] }, "namn", 500);
      const both = await getQueueIds(ORG, U1, { ...scope, sources: [a, b] }, "namn", 500);
      expect(new Set(both)).toEqual(new Set([...onlyA, ...onlyB]));
      expect(await getQueueIds(ORG, U1, { ...scope, sources: [a, "finns-inte"] }, "namn", 500)).toEqual(onlyA);
    });
  });
});

