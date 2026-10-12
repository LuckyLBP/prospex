import { pool } from "./db";
import { addDays, dateKey, startOfDayUtc } from "./time";
import { aggregateTeam, type TeamCall, type TeamPeriod } from "./calls/team";
import { bucketByDay } from "./calls/week";
import type { CallOutcome } from "./calls/outcomes";

// Allt här är per bolag (orgId). Katalogen (companies/suppliers/signals) är global.

export type Company = {
  id: string; name: string | null; orgnr: string | null; phone: string | null; email: string | null;
  website: string | null; city: string | null; sni: string | null;
  signals: { supplier: string; logo: string | null; kind: "supplier" | "list"; icon: string | null; names_brand: boolean; source_url: string | null }[];
};

export async function getCompany(id: string): Promise<Company | null> {
  const { rows } = await pool.query(
    `select c.id, c.name, c.orgnr, c.phone, c.email, c.website,
            c.registry->'organisation'->'address'->>'city' as city,
            c.registry->'organisation'->'sni'->0->>'label' as sni,
            coalesce((select json_agg(json_build_object('supplier', s.name, 'logo', s.logo_path, 'kind', s.kind, 'icon', k.icon, 'names_brand', coalesce(k.names_brand, s.kind = 'supplier'), 'source_url', cs.source_url) order by (s.kind = 'supplier') desc, s.name)
                      from company_signals cs join suppliers s on s.id = cs.supplier_id and s.published left join list_categories k on k.id = s.category_id
                      where cs.company_id = c.id), '[]') as signals
     from companies c where c.id = $1`,
    [id],
  );
  return (rows[0] as Company | undefined) ?? null;
}

export type Contact = {
  outcome: CallOutcome | null; note: string | null; last_called_at: Date | null; last_called_by_email: string | null;
  call_count: number; next_callback_at: Date | null; callback_has_time: boolean; meeting_at: Date | null; archived_at: Date | null;
};

export async function getContact(orgId: string, companyId: string) {
  const { rows } = await pool.query(
    `select outcome, note, last_called_at, last_called_by_email, call_count, next_callback_at, callback_has_time, meeting_at, archived_at
     from contacts where org_id = $1 and company_id = $2`,
    [orgId, companyId],
  );
  return (rows[0] as Contact | undefined) ?? null;
}

export async function getCallLogs(orgId: string, companyId: string) {
  const { rows } = await pool.query(
    `select outcome, note, called_at, user_email, callback_at, meeting_at from call_logs
     where org_id = $1 and company_id = $2 order by called_at desc limit 30`,
    [orgId, companyId],
  );
  return rows as { outcome: CallOutcome; note: string | null; called_at: Date; user_email: string; callback_at: Date | null; meeting_at: Date | null }[];
}

export async function getUpcomingForCompany(orgId: string, companyId: string) {
  const { rows } = await pool.query(
    `select id, kind, title, starts_at from calendar_events
     where org_id = $1 and company_id = $2 and ends_at >= now() order by starts_at limit 10`,
    [orgId, companyId],
  );
  return rows as { id: string; kind: string; title: string; starts_at: Date }[];
}

export async function listContacts(orgId: string, userId: string, o: { scope: "mine" | "org"; outcome?: string; q?: string }) {
  const args: unknown[] = [orgId];
  const cond = ["k.org_id = $1", "k.archived_at is null", "k.outcome is not null"];
  if (o.scope === "mine") { args.push(userId); cond.push(`k.last_called_by = $${args.length}`); }
  if (o.outcome) { args.push(o.outcome); cond.push(`k.outcome = $${args.length}`); }
  if (o.q) { args.push(`%${o.q.toLowerCase()}%`); cond.push(`c.search_text like $${args.length}`); }
  const { rows } = await pool.query(
    `select c.id, c.name, c.phone, k.outcome, k.note, k.last_called_at, k.last_called_by_email, k.call_count,
            k.next_callback_at, k.callback_has_time, k.meeting_at
     from contacts k join companies c on c.id = k.company_id
     where ${cond.join(" and ")} order by k.last_called_at desc nulls last limit 500`,
    args,
  );
  return rows as {
    id: string; name: string | null; phone: string | null; outcome: CallOutcome; note: string | null; last_called_at: Date | null;
    last_called_by_email: string | null; call_count: number; next_callback_at: Date | null; callback_has_time: boolean; meeting_at: Date | null;
  }[];
}

export async function contactCounts(orgId: string, userId: string, scope: "mine" | "org") {
  const args: unknown[] = [orgId];
  let extra = "";
  if (scope === "mine") { args.push(userId); extra = "and last_called_by = $2"; }
  const { rows } = await pool.query(
    `select outcome, count(*)::int n from contacts where org_id = $1 and archived_at is null and outcome is not null ${extra} group by outcome`,
    args,
  );
  return Object.fromEntries(rows.map((r) => [r.outcome, r.n])) as Record<string, number>;
}

/** Mina återringningar som är förfallna eller infaller i dag. */
export async function dueCallbacks(orgId: string, userId: string, limit = 8) {
  const tomorrow = startOfDayUtc(addDays(dateKey(new Date()), 1));
  const { rows } = await pool.query(
    `select c.id, c.name, c.phone, k.next_callback_at, k.callback_has_time
     from contacts k join companies c on c.id = k.company_id
     where k.org_id = $1 and k.last_called_by = $2 and k.archived_at is null
       and k.next_callback_at is not null and k.next_callback_at < $3
     order by k.next_callback_at limit $4`,
    [orgId, userId, tomorrow, limit],
  );
  return rows as { id: string; name: string | null; phone: string | null; next_callback_at: Date; callback_has_time: boolean }[];
}

export async function homeStats(orgId: string, userId: string) {
  const today = dateKey(new Date());
  const start = startOfDayUtc(today);
  const tomorrow = startOfDayUtc(addDays(today, 1));
  const { rows } = await pool.query(
    `select
       (select count(*) from call_logs where org_id = $1 and user_id = $2 and called_at >= $3)::int as calls_today,
       (select count(*) from call_logs where org_id = $1 and called_at >= $3)::int as team_calls_today,
       (select count(*) from contacts where org_id = $1 and last_called_by = $2 and archived_at is null and outcome is not null)::int as contacts,
       (select count(*) from contacts where org_id = $1 and archived_at is null and meeting_at >= now() and meeting_at < now() + interval '30 days')::int as meetings,
       (select count(*) from contacts where org_id = $1 and last_called_by = $2 and archived_at is null and next_callback_at >= $3 and next_callback_at < $4)::int as callbacks_today,
       (select count(*) from contacts where org_id = $1 and last_called_by = $2 and archived_at is null and next_callback_at < $3)::int as callbacks_overdue`,
    [orgId, userId, start, tomorrow],
  );
  return rows[0] as { calls_today: number; team_calls_today: number; contacts: number; meetings: number; callbacks_today: number; callbacks_overdue: number };
}

/** Mina samtal de senaste sju svenska dygnen, för veckodiagrammet. */
export async function myCallStats(orgId: string, userId: string) {
  const since = startOfDayUtc(addDays(dateKey(new Date()), -6));
  const { rows } = await pool.query(
    `select called_at from call_logs where org_id = $1 and user_id = $2 and called_at >= $3 limit 5000`,
    [orgId, userId, since],
  );
  const week = bucketByDay(rows.map((r) => (r.called_at as Date).toISOString()));
  return { today: week[week.length - 1]?.count ?? 0, week };
}

/** Teamets siffror (per säljare och per leverantör) de senaste `days` svenska dygnen. */
export async function teamStats(orgId: string, days: TeamPeriod) {
  const since = startOfDayUtc(addDays(dateKey(new Date()), -(days - 1)));
  const { rows } = await pool.query(
    `select cl.company_id, coalesce(cl.user_id::text, 'email:' || lower(cl.user_email)) as uid, cl.user_email, cl.outcome
     from call_logs cl where cl.org_id = $1 and cl.called_at >= $2 limit 50000`,
    [orgId, since],
  );
  const calls: TeamCall[] = rows.map((r) => ({ recordId: r.company_id, userId: r.uid, userEmail: r.user_email, outcome: r.outcome, profileId: null }));

  // Per leverantör: samma samtal räknas under varje leverantör företaget har signal från.
  const { rows: srows } = await pool.query(
    `select cl.company_id, cl.user_email, cl.outcome, cs.supplier_id::text as profile_id
     from call_logs cl join company_signals cs on cs.company_id = cl.company_id
     join suppliers s on s.id = cs.supplier_id and s.published
     where cl.org_id = $1 and cl.called_at >= $2 limit 100000`,
    [orgId, since],
  );
  const expanded: TeamCall[] = srows.map((r) => ({ recordId: r.company_id, userId: "x", userEmail: r.user_email, outcome: r.outcome, profileId: r.profile_id }));

  const base = aggregateTeam(calls);
  const sources = aggregateTeam(expanded).sources;
  const { rows: sup } = await pool.query(`select id::text, name from suppliers`);
  return { stats: { ...base, sources }, suppliers: new Map(sup.map((s) => [s.id as string, s.name as string])), since };
}

// --- Kalender (personlig) ---------------------------------------------------

export async function upcomingEvents(userId: string, limit = 5) {
  const { rows } = await pool.query(
    `select e.id, e.kind, e.title, e.starts_at, e.company_id from calendar_events e
     where e.user_id = $1 and e.ends_at >= now() order by e.starts_at limit $2`,
    [userId, limit],
  );
  return rows as { id: string; kind: string; title: string; starts_at: Date; company_id: string | null }[];
}

export async function ensureFeedToken(userId: string): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  const { rows } = await pool.query(
    `insert into calendar_feeds (user_id, token) values ($1, $2)
     on conflict (user_id) do update set user_id = excluded.user_id returning token`,
    [userId, randomBytes(32).toString("hex")],
  );
  return rows[0].token as string;
}

export async function rotateFeedToken(userId: string): Promise<void> {
  const { randomBytes } = await import("node:crypto");
  await pool.query(`update calendar_feeds set token = $2, created_at = now() where user_id = $1`, [userId, randomBytes(32).toString("hex")]);
}

export async function eventsBetween(userId: string, from: Date, to: Date) {
  const { rows } = await pool.query(
    `select e.id, e.kind, e.title, e.starts_at, e.ends_at, e.company_id, e.note
     from calendar_events e where e.user_id = $1 and e.starts_at >= $2 and e.starts_at < $3 order by e.starts_at`,
    [userId, from, to],
  );
  return rows as { id: string; kind: string; title: string; starts_at: Date; ends_at: Date; company_id: string | null; note: string | null }[];
}
