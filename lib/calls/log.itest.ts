import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { logCall, undoCall } from "./log";

const ORG = "cccccccc-0000-0000-0000-000000000001";
const U1 = "dddddddd-0000-0000-0000-000000000001";
const U2 = "dddddddd-0000-0000-0000-000000000002";
let A = "";
let B = "";

const user = (id: string) => ({ id, email: `${id === U1 ? "it1" : "it2"}@example.invalid` });
const call = (company: string, o: Partial<Parameters<typeof logCall>[0]> = {}) =>
  logCall({ orgId: ORG, user: user(U1), companyId: company, outcome: "no_answer", note: null, callbackAt: null, callbackHasTime: false, meetingAt: null, archive: false, ...o });
const contact = async (company: string) => (await pool.query(`select * from contacts where org_id = $1 and company_id = $2`, [ORG, company])).rows[0];
const events = async (company: string) => (await pool.query(`select id, kind, starts_at from calendar_events where org_id = $1 and company_id = $2 order by starts_at`, [ORG, company])).rows;
const FUTURE = new Date(Date.now() + 3 * 86400_000);

beforeAll(async () => {
  await cleanup();
  await pool.query(`insert into organizations (id, name, slug) values ($1, 'IT Test', 'it-test')`, [ORG]);
  for (const [id, email] of [[U1, "it1@example.invalid"], [U2, "it2@example.invalid"]]) {
    await pool.query(
      `insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,now(),now())`,
      [id, email],
    );
  }
  const r = await pool.query(`select id from companies where phone is not null order by id limit 2`);
  [A, B] = r.rows.map((x) => x.id);
});
afterAll(async () => { await cleanup(); await pool.end(); });
async function cleanup() {
  await pool.query(`delete from organizations where id = $1`, [ORG]);
  await pool.query(`delete from auth.users where id in ($1,$2)`, [U1, U2]);
}

describe("undoCall", () => {
  it("undoing the very first call removes the contact, the log and the events it created", async () => {
    const { logId } = await call(A, { outcome: "callback", callbackAt: FUTURE, callbackHasTime: true, note: "första" });
    expect((await contact(A)).outcome).toBe("callback");
    expect(await events(A)).toHaveLength(1);
    await undoCall(ORG, U1, logId);
    expect(await contact(A)).toBeUndefined();
    expect(await events(A)).toHaveLength(0);
    expect((await pool.query(`select 1 from call_logs where id = $1`, [logId])).rowCount).toBe(0);
  });

  it("undoing a later call restores the earlier contact state and the event it replaced", async () => {
    await call(A, { outcome: "callback", callbackAt: FUTURE, callbackHasTime: true, note: "ring på tisdag" });
    const before = await contact(A);
    const evBefore = await events(A);
    expect(evBefore).toHaveLength(1);

    const later = new Date(FUTURE.getTime() + 86400_000);
    const second = await call(A, { outcome: "callback", callbackAt: later, callbackHasTime: true, note: "nytt försök", archive: false });
    const evAfter = await events(A);
    expect(evAfter).toHaveLength(1);
    expect(evAfter[0].id).not.toBe(evBefore[0].id); // den gamla ersattes

    await undoCall(ORG, U1, second.logId);
    const restored = await contact(A);
    expect(restored.call_count).toBe(before.call_count);
    expect(restored.note).toBe(before.note);
    expect(new Date(restored.next_callback_at).getTime()).toBe(new Date(before.next_callback_at).getTime());
    const evRestored = await events(A);
    expect(evRestored).toHaveLength(1);
    expect(evRestored[0].id).toBe(evBefore[0].id); // samma händelse tillbaka, så kalender-UID är oförändrat
  });

  it("restores an archived flag that the undone call had set", async () => {
    await call(B, { outcome: "no_answer" });
    expect((await contact(B)).archived_at).toBeNull();
    const { logId } = await call(B, { outcome: "not_relevant", archive: true });
    expect((await contact(B)).archived_at).not.toBeNull();
    await undoCall(ORG, U1, logId);
    expect((await contact(B)).archived_at).toBeNull();
    expect((await contact(B)).outcome).toBe("no_answer");
  });

  it("refuses another user, and refuses when someone has called since", async () => {
    const first = await call(B, { outcome: "busy" });
    await expect(undoCall(ORG, U2, first.logId)).rejects.toThrow(/inte längre att ångra/);
    await call(B, { outcome: "no_answer" }); // senare samtal på samma företag
    await expect(undoCall(ORG, U1, first.logId)).rejects.toThrow(/sedan dess/);
  });

  it("refuses after the one minute window", async () => {
    const { logId } = await call(A, { outcome: "no_answer" });
    await pool.query(`update call_logs set called_at = now() - interval '2 minutes' where id = $1`, [logId]);
    await expect(undoCall(ORG, U1, logId)).rejects.toThrow(/inte längre att ångra/);
  });

  it("refuses for another company's org", async () => {
    const { logId } = await call(B, { outcome: "no_answer" });
    await expect(undoCall("cccccccc-0000-0000-0000-0000000000ff", U1, logId)).rejects.toThrow();
  });
});
