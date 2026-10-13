import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "./db";
import type { Email } from "./email/templates";
import { runReminders, sendReminder } from "./reminders";

const ORG = "cccccccc-0000-0000-0000-000000000004";
const U1 = "dddddddd-0000-0000-0000-000000000041"; // har återringning idag, påminnelse på
const U2 = "dddddddd-0000-0000-0000-000000000042"; // påminnelse på, inget att ringa
const U3 = "dddddddd-0000-0000-0000-000000000043"; // påminnelse av, har återringning
const sent: { to: string; mail: Email }[] = [];
const send = async (to: string, mail: Email) => { sent.push({ to, mail }); };

async function cleanup() {
  await pool.query(`delete from organizations where id = $1`, [ORG]);
  await pool.query(`delete from auth.users where id = any($1)`, [[U1, U2, U3]]);
  await pool.query(`delete from companies where dedupe_key like 'zz-rem:%'`);
}
beforeAll(async () => {
  await cleanup();
  await pool.query(`insert into organizations (id, name, slug) values ($1, 'IT Reminders', 'it-reminders')`, [ORG]);
  for (const [id, n] of [[U1, 1], [U2, 2], [U3, 3]] as const) {
    await pool.query(`insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,now(),now())`, [id, `rem${n}@example.invalid`]);
    await pool.query(`insert into profiles (user_id, email, full_name) values ($1, $2, $3)`, [id, `rem${n}@example.invalid`, `Person ${n}`]);
    await pool.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'member')`, [ORG, id]);
    await pool.query(`insert into member_prefs (user_id, callback_email) values ($1, $2) on conflict (user_id) do update set callback_email = excluded.callback_email, last_reminder_on = null`, [id, n !== 3]);
  }
  const cs = (await pool.query(`insert into companies (dedupe_key, name, phone, first_seen_at, last_seen_at) select 'zz-rem:' || g, 'Påminn ' || g, '+4680000' || g, now(), now() from generate_series(1,3) g returning id`)).rows.map((r) => r.id as string);
  for (const [c, u] of [[cs[0], U1], [cs[1], U1], [cs[2], U3]] as const) {
    await pool.query(`insert into contacts (org_id, company_id, outcome, last_called_by, last_called_at, next_callback_at, callback_has_time, call_count) values ($1,$2,'no_answer',$3, now() - interval '1 day', now() - interval '1 hour', true, 1)`, [ORG, c, u]);
  }
});
afterAll(async () => { await cleanup(); await pool.end(); });

describe("morning reminders", () => {
  it("mails only people who turned it on and have callbacks, and does not mail twice on the same day", async () => {
    const first = await runReminders("https://test.example", new Date(), send);
    const mine = sent.filter((s) => /^rem[123]@/.test(s.to));
    expect(mine.map((s) => s.to)).toEqual(["rem1@example.invalid"]);
    expect(mine[0].mail.subject).toBe("Du har 2 återringningar idag");
    expect(first.failed).toBe(0);

    const before = sent.length;
    await runReminders("https://test.example", new Date(), send);
    expect(sent.length).toBe(before);
    const done = (await pool.query(`select user_id from member_prefs where user_id = any($1) and last_reminder_on is not null`, [[U1, U2, U3]])).rows.map((r) => r.user_id);
    expect(done.sort()).toEqual([U1, U2].sort());
  });
  it("sends a test mail even when nothing is due, and none when it is not a test", async () => {
    const to = { userId: U2, orgId: ORG, email: "rem2@example.invalid", name: "Person 2" };
    const n = sent.length;
    expect(await sendReminder(to, "https://test.example", { send })).toEqual({ sent: false, total: 0 });
    expect(await sendReminder(to, "https://test.example", { send, test: true })).toEqual({ sent: true, total: 0 });
    expect(sent.length).toBe(n + 1);
  });
});
