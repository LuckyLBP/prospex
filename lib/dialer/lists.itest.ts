import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db";
import { finishList, loadList, saveNewList, savePosition } from "./lists";
import { getQueueIds } from "./queue";
import { resumeList } from "./resume";

const ORG = "cccccccc-0000-0000-0000-000000000003";
const U1 = "dddddddd-0000-0000-0000-000000000021";
const scope = { sources: ["roi"], mode: "new" as const, template: "fresh" as const };

async function cleanup() {
  await pool.query(`delete from organizations where id = $1`, [ORG]);
  await pool.query(`delete from auth.users where id = $1`, [U1]);
}
beforeAll(async () => {
  await cleanup();
  await pool.query(`insert into organizations (id, name, slug) values ($1, 'IT Lists', 'it-lists')`, [ORG]);
  await pool.query(`insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated','l1@example.invalid',now(),now())`, [U1]);
});
beforeEach(async () => { await pool.query(`delete from dialer_lists where org_id = $1`, [ORG]); await pool.query(`delete from contacts where org_id = $1`, [ORG]); });
afterAll(async () => { await cleanup(); await pool.end(); });

describe("the saved list", () => {
  it("is saved, loaded, moved forward and replaced", async () => {
    const ids = await getQueueIds(ORG, U1, scope, "namn", 6);
    await saveNewList(ORG, U1, scope, "namn", ids);
    expect(await loadList(ORG, U1)).toMatchObject({ scope, order: "namn", ids, currentId: ids[0], completed: false });

    await savePosition(ORG, U1, ids[3]);
    expect((await loadList(ORG, U1))!.currentId).toBe(ids[3]);
    await savePosition(ORG, U1, "99999999-9999-9999-9999-999999999999"); // inte i listan: ignoreras
    expect((await loadList(ORG, U1))!.currentId).toBe(ids[3]);

    const other = await getQueueIds(ORG, U1, { ...scope, template: "noanswer" }, "namn", 6);
    await saveNewList(ORG, U1, { ...scope, template: "noanswer" }, "namn", other);
    expect(await loadList(ORG, U1)).toMatchObject({ scope: { template: "noanswer" }, ids: other, completed: false });
  });

  it("is marked finished, and no longer takes a position", async () => {
    const ids = await getQueueIds(ORG, U1, scope, "namn", 3);
    await saveNewList(ORG, U1, scope, "namn", ids);
    await finishList(ORG, U1);
    expect((await loadList(ORG, U1))!.completed).toBe(true);
    await savePosition(ORG, U1, ids[2]);
    expect((await loadList(ORG, U1))!.currentId).toBe(ids[0]);
  });

  it("resumes where the caller was, without the companies handled since", async () => {
    const ids = await getQueueIds(ORG, U1, scope, "namn", 6);
    await saveNewList(ORG, U1, scope, "namn", ids);
    await savePosition(ORG, U1, ids[2]);
    // ids[1] och ids[2] blir ringda av någon annan i bolaget under tiden
    await pool.query(`insert into contacts (org_id, company_id, outcome, last_called_at, call_count) select $1, c, 'not_interested', now(), 1 from unnest($2::uuid[]) c`, [ORG, [ids[1], ids[2]]]);

    const saved = (await loadList(ORG, U1))!;
    const eligible = new Set(await getQueueIds(ORG, U1, saved.scope, saved.order, 5000));
    const r = resumeList(saved.ids, saved.currentId, eligible);
    expect(r.ids).not.toContain(ids[1]);
    expect(r.ids).not.toContain(ids[2]);
    expect(r.ids[r.startIndex]).toBe(ids[3]);
    expect(r.ids.slice(0, 1)).toEqual([ids[0]]);
  });
});
