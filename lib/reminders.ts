import { pool } from "./db";
import { sendEmail } from "./email/send";
import { callbackReminderEmail, type Email, type ReminderItem } from "./email/templates";
import { addDays, dateKey, formatTime, startOfDayUtc } from "./time";

// Morgonmejlet med dagens återringningar, för de som slagit på det i Inställningar. Körs av /api/cron/reminders.

export const REMINDER_ITEMS = 8;

interface DueRow { name: string | null; phone: string | null; next_callback_at: Date; callback_has_time: boolean }

/** En rad i mejlet. Tiden visas bara när återringningen har en. Ren. */
export function toItem(r: DueRow): ReminderItem {
  return { name: r.name ?? "Okänt företag", phone: r.phone, when: r.callback_has_time ? `Kl ${formatTime(new Date(r.next_callback_at))}` : null };
}

/** Förfallna och dagens återringningar för en person, och hur många det är totalt. */
export async function loadDue(orgId: string, userId: string, now: Date = new Date()): Promise<{ total: number; items: ReminderItem[] }> {
  const tomorrow = startOfDayUtc(addDays(dateKey(now), 1));
  const { rows } = await pool.query(
    `select c.name, c.phone, k.next_callback_at, k.callback_has_time, count(*) over ()::int as total
     from contacts k join companies c on c.id = k.company_id
     where k.org_id = $1 and k.last_called_by = $2 and k.archived_at is null
       and k.next_callback_at is not null and k.next_callback_at < $3
     order by k.next_callback_at limit ${REMINDER_ITEMS}`,
    [orgId, userId, tomorrow],
  );
  return { total: (rows[0]?.total as number | undefined) ?? 0, items: (rows as DueRow[]).map(toItem) };
}

export interface Recipient { userId: string; orgId: string; email: string; name: string }

/** Skickar mejlet till en person. Utan återringningar skickas inget, utom för ett testmejl. */
export type Send = (to: string, mail: Email) => Promise<void>;

export async function sendReminder(to: Recipient, baseUrl: string, opts: { test?: boolean; now?: Date; send?: Send } = {}): Promise<{ sent: boolean; total: number }> {
  const due = await loadDue(to.orgId, to.userId, opts.now);
  if (due.total === 0 && !opts.test) return { sent: false, total: 0 };
  const mail = callbackReminderEmail({ name: to.name, total: due.total, items: due.items, url: `${baseUrl}/app/ring?queue=callbacks`, settingsUrl: `${baseUrl}/app/installningar`, test: opts.test });
  await (opts.send ?? sendEmail)(to.email, mail);
  return { sent: true, total: due.total };
}

export interface RunResult { checked: number; sent: number; failed: number }

/** Alla som slagit på påminnelser och inte fått ett i dag. En svensk dag räknas som en gång, så en omkörning mejlar ingen dubbelt. */
export async function runReminders(baseUrl: string, now: Date = new Date(), send: Send = sendEmail): Promise<RunResult> {
  const today = dateKey(now);
  const { rows } = await pool.query(
    `select p.user_id, p.email::text as email, coalesce(nullif(p.full_name, ''), split_part(p.email::text, '@', 1)) as name, m.org_id
     from member_prefs mp
     join profiles p on p.user_id = mp.user_id and p.active
     join memberships m on m.user_id = p.user_id
     join organizations o on o.id = m.org_id and o.active
     where mp.callback_email and (mp.last_reminder_on is null or mp.last_reminder_on < $1::date)`,
    [today],
  );
  const result: RunResult = { checked: rows.length, sent: 0, failed: 0 };
  for (const r of rows) {
    try {
      const { sent } = await sendReminder({ userId: r.user_id, orgId: r.org_id, email: r.email, name: r.name }, baseUrl, { now, send });
      // Dagen är avklarad för personen, även när det inte fanns något att mejla: då dyker inget upp senare på dagen.
      await pool.query(`update member_prefs set last_reminder_on = $2::date where user_id = $1`, [r.user_id, today]);
      if (sent) result.sent++;
    } catch (e) {
      result.failed++;
      console.error(`[påminnelse] kunde inte mejla ${r.email}:`, e instanceof Error ? e.message : e);
    }
  }
  return result;
}
