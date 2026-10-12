import { pool } from "../db";
import { outcomeInfo, ALL_OUTCOME_VALUES, type CallOutcome } from "./outcomes";

export type LogCallInput = {
  orgId: string;
  user: { id: string; email: string };
  companyId: string;
  outcome: string;
  note: string | null;
  callbackAt: Date | null;
  callbackHasTime: boolean;
  meetingAt: Date | null;
  archive: boolean;
};

export class CallError extends Error {}

/**
 * Loggar ett samtal i en transaktion (portad från scrape_log_call):
 * historikrad, bolagets kontaktstatus, valfri arkivering, släpper reservationen och
 * lägger återringning/möte i säljarens kalender.
 */
export async function logCall(i: LogCallInput): Promise<{ logId: string }> {
  if (!(ALL_OUTCOME_VALUES as readonly string[]).includes(i.outcome)) throw new CallError("Ogiltigt utfall");
  const outcome = i.outcome as CallOutcome;
  const info = outcomeInfo(outcome);
  if (info.meeting && !i.meetingAt) throw new CallError("Mötets datum och tid saknas");
  const meetingAt = info.meeting ? i.meetingAt : null;
  const callbackAt = info.callback ? i.callbackAt : null;
  const note = i.note?.trim().slice(0, 2000) || null;

  const client = await pool.connect();
  try {
    await client.query("begin");
    let logId = "";
    const c = await client.query(`select name from companies where id = $1`, [i.companyId]);
    if (!c.rows[0]) throw new CallError("Företaget finns inte");
    const name = (c.rows[0].name as string | null) ?? "Okänt företag";

    // Tillståndet före samtalet, så att det går att ångra: kontakten och de framtida händelser som ersätts.
    const prevContact = (await client.query(
      `select outcome, note, last_called_at, last_called_by, last_called_by_email, call_count, next_callback_at,
              callback_has_time, meeting_at, archived_at, archived_by
       from contacts where org_id = $1 and company_id = $2 for update`,
      [i.orgId, i.companyId],
    )).rows[0] ?? null;
    const replaced = (await client.query(
      `select id, kind, title, starts_at, ends_at, note, user_id from calendar_events
       where org_id = $1 and company_id = $2 and user_id = $3 and starts_at > now()
         and (kind = 'aterringning' or ($4 and kind = 'mote'))`,
      [i.orgId, i.companyId, i.user.id, !!meetingAt],
    )).rows;

    logId = (await client.query(
      `insert into call_logs (org_id, company_id, user_id, user_email, outcome, note, callback_at, meeting_at, prev_state)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [i.orgId, i.companyId, i.user.id, i.user.email, outcome, note, callbackAt, meetingAt, JSON.stringify({ contact: prevContact, events: replaced })],
    )).rows[0].id as string;
    await client.query(
      `insert into contacts (org_id, company_id, outcome, note, last_called_at, last_called_by, last_called_by_email, call_count,
                             next_callback_at, callback_has_time, meeting_at, archived_at, archived_by)
       values ($1,$2,$3,$4,now(),$5,$6,1,$7,$8,$9, case when $10 then now() end, case when $10 then $5::uuid end)
       on conflict (org_id, company_id) do update set
         outcome = excluded.outcome, note = coalesce(excluded.note, contacts.note), last_called_at = now(),
         last_called_by = excluded.last_called_by, last_called_by_email = excluded.last_called_by_email,
         call_count = contacts.call_count + 1, next_callback_at = excluded.next_callback_at,
         callback_has_time = excluded.callback_has_time, meeting_at = excluded.meeting_at,
         archived_at = case when $10 then coalesce(contacts.archived_at, now()) else contacts.archived_at end,
         archived_by = case when $10 then coalesce(contacts.archived_by, $5::uuid) else contacts.archived_by end,
         updated_at = now()`,
      [i.orgId, i.companyId, outcome, note, i.user.id, i.user.email, callbackAt, !!callbackAt && i.callbackHasTime, meetingAt, i.archive],
    );
    await client.query(`delete from claims where org_id = $1 and company_id = $2 and user_id = $3`, [i.orgId, i.companyId, i.user.id]);

    // Kalender: en ny återringning/möte ersätter tidigare framtida av samma slag för företaget.
    if (replaced.length) await client.query(`delete from calendar_events where id = any($1::uuid[])`, [replaced.map((e) => e.id)]);
    if (callbackAt && i.callbackHasTime) {
      await client.query(
        `insert into calendar_events (org_id, user_id, company_id, kind, title, starts_at, ends_at, note, call_log_id) values ($1,$2,$3,'aterringning',$4,$5,$6,$7,$8)`,
        [i.orgId, i.user.id, i.companyId, `Ring tillbaka: ${name}`, callbackAt, new Date(callbackAt.getTime() + 15 * 60_000), note, logId],
      );
    }
    if (meetingAt) {
      await client.query(
        `insert into calendar_events (org_id, user_id, company_id, kind, title, starts_at, ends_at, note, call_log_id) values ($1,$2,$3,'mote',$4,$5,$6,$7,$8)`,
        [i.orgId, i.user.id, i.companyId, `Möte: ${name}`, meetingAt, new Date(meetingAt.getTime() + 60 * 60_000), note, logId],
      );
    }
    await client.query("commit");
    return { logId };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Arkivera eller återställ ett företag för bolaget. Katalogen rörs aldrig. */
export async function setArchived(orgId: string, userId: string, companyId: string, archived: boolean) {
  await pool.query(
    `insert into contacts (org_id, company_id, archived_at, archived_by) values ($1,$2, case when $4 then now() end, case when $4 then $3::uuid end)
     on conflict (org_id, company_id) do update set
       archived_at = case when $4 then coalesce(contacts.archived_at, now()) else null end,
       archived_by = case when $4 then coalesce(contacts.archived_by, $3::uuid) else null end,
       updated_at = now()`,
    [orgId, companyId, userId, archived],
  );
}

/** Hur länge efter samtalet det går att ångra. */
export const UNDO_WINDOW_SEC = 60;

/**
 * Ångrar ett samtal: återställer kontaktens tidigare tillstånd och de händelser samtalet ersatte, och
 * raderar loggraden (och därmed de händelser samtalet skapade). Bara den som loggade, bara det senaste
 * samtalet på företaget och högst en minut efteråt.
 */
export async function undoCall(orgId: string, userId: string, logId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const log = (await client.query(
      `select company_id, prev_state from call_logs
       where id = $1 and org_id = $2 and user_id = $3 and called_at > now() - make_interval(secs => $4) for update`,
      [logId, orgId, userId, UNDO_WINDOW_SEC],
    )).rows[0] as { company_id: string; prev_state: { contact: Record<string, unknown> | null; events: Record<string, unknown>[] } | null } | undefined;
    if (!log || !log.prev_state) throw new CallError("Det går inte längre att ångra samtalet.");

    const latest = (await client.query(
      `select id from call_logs where org_id = $1 and company_id = $2 order by called_at desc, id desc limit 1`,
      [orgId, log.company_id],
    )).rows[0];
    if (latest?.id !== logId) throw new CallError("Någon har ringt företaget sedan dess, så samtalet går inte att ångra.");

    const prev = log.prev_state.contact;
    if (!prev) {
      await client.query(`delete from contacts where org_id = $1 and company_id = $2`, [orgId, log.company_id]);
    } else {
      await client.query(
        `update contacts set outcome = $3, note = $4, last_called_at = $5, last_called_by = $6, last_called_by_email = $7,
           call_count = $8, next_callback_at = $9, callback_has_time = $10, meeting_at = $11, archived_at = $12, archived_by = $13, updated_at = now()
         where org_id = $1 and company_id = $2`,
        [orgId, log.company_id, prev.outcome, prev.note, prev.last_called_at, prev.last_called_by, prev.last_called_by_email,
         prev.call_count, prev.next_callback_at, prev.callback_has_time, prev.meeting_at, prev.archived_at, prev.archived_by],
      );
    }
    await client.query(`delete from call_logs where id = $1`, [logId]); // tar de händelser samtalet skapade
    for (const e of log.prev_state.events) {
      await client.query(
        `insert into calendar_events (id, org_id, user_id, company_id, kind, title, starts_at, ends_at, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (id) do nothing`,
        [e.id, orgId, e.user_id, log.company_id, e.kind, e.title, e.starts_at, e.ends_at, e.note],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
