import { pool } from "@/lib/db";
import { LIMITS, planRelease, rateDecision, type Limits, type ReleasePlan } from "./limits";

// Släpper uppgifter om företag till en användare och för bok över det. Samma regler överallt där uppgifter lämnar
// servern: ringlägets kort, företagssidan, sökningen och listorna. Räknar i databasen, så att det håller över flera
// serverinstanser. En användares anrop serialiseras med ett lås, så att två samtidiga anrop inte slinker förbi gränsen.

export interface Who {
  userId: string;
  orgId: string;
  /** Plattformsadmin: ingen gräns, men allt loggas. */
  isAdmin?: boolean;
}

const DAY_START = `date_trunc('day', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm'`;

/** Vilka av företagen som får visas, och bokför dem. Ett företag räknas en gång per dygn. */
export async function releaseCompanies(who: Who, ids: readonly string[], limits: Limits = LIMITS): Promise<ReleasePlan & { usedToday: number }> {
  const requested = [...new Set(ids)];
  if (requested.length === 0) return { allowed: [], counted: [], blocked: [], reason: null, usedToday: 0 };
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`access:${who.userId}`]);
    const { rows } = await client.query(
      `select
         coalesce((select array_agg(distinct a.company_id::text) from access_log a where a.user_id = $1 and a.kind = 'view' and a.at >= ${DAY_START} and a.company_id = any($2::uuid[])), '{}') as seen,
         coalesce((select array_agg(k.company_id::text) from contacts k where k.org_id = $3 and k.company_id = any($2::uuid[])), '{}') as own,
         (select count(distinct company_id)::int from access_log where user_id = $1 and kind = 'view' and at >= ${DAY_START}) as today,
         (select count(distinct company_id)::int from access_log where user_id = $1 and kind = 'view' and at > now() - interval '1 minute') as minute`,
      [who.userId, requested, who.orgId],
    );
    const r = rows[0] as { seen: string[]; own: string[]; today: number; minute: number };
    const free = new Set([...r.seen, ...r.own]);
    const plan = who.isAdmin
      ? { allowed: requested, counted: requested.filter((id) => !free.has(id)), blocked: [], reason: null }
      : planRelease({ requested, free, usedToday: r.today, usedMinute: r.minute }, limits);
    if (plan.counted.length > 0) {
      await client.query(`insert into access_log (user_id, org_id, kind, company_id) select $1, $2, 'view', unnest($3::uuid[])`, [who.userId, who.orgId, plan.counted]);
    }
    // Gamla rader städas bort nu och då, så att tabellen inte växer för alltid.
    if (Math.random() < 0.01) await client.query(`delete from access_log where at < now() - interval '90 days'`);
    await client.query("commit");
    return { ...plan, usedToday: r.today + plan.counted.length };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** En sökning eller listvisning: svarar om den är tillåten just nu och bokför den i så fall. */
export async function checkRate(who: Who, kind: "search" | "list", limits: Limits = LIMITS): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`access:${who.userId}`]);
    const n = (await client.query(`select count(*)::int n from access_log where user_id = $1 and kind = $2 and at > now() - interval '1 minute'`, [who.userId, kind])).rows[0].n as number;
    const d = who.isAdmin ? ({ ok: true } as const) : rateDecision(kind, n, limits);
    if (d.ok) await client.query(`insert into access_log (user_id, org_id, kind) values ($1, $2, $3)`, [who.userId, who.orgId, kind]);
    await client.query("commit");
    return d;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
