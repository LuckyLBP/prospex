import { pool } from "@/lib/db";
import { LIMITS, type Limits } from "./limits";

// Underlag för adminvyn "Åtkomst": hur många företag varje användare tagit del av, och vem som ligger nära gränsen.

export interface AccessRow {
  user_id: string;
  email: string;
  org_name: string | null;
  today: number;
  week: number;
  /** Mest på en minut under de senaste sju dagarna. */
  peak_minute: number;
  searches_24h: number;
  last_at: string | null;
}

export type AccessLevel = "ok" | "near" | "reached";

/** Hur nära dygnsgränsen en användare är. Ren. */
export function accessLevel(today: number, limits: Limits = LIMITS): AccessLevel {
  if (today >= limits.dailyViews) return "reached";
  return today >= limits.dailyViews * limits.flagAt ? "near" : "ok";
}

export async function accessReport(): Promise<AccessRow[]> {
  const { rows } = await pool.query(
    `with start as (select date_trunc('day', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm' as d),
     per_minute as (
       select user_id, max(n) as peak from (
         select user_id, count(*)::int n from access_log where kind = 'view' and at >= now() - interval '7 days' group by user_id, date_trunc('minute', at)
       ) x group by user_id)
     select p.user_id, p.email::text as email, o.name as org_name,
            count(distinct a.company_id) filter (where a.kind = 'view' and a.at >= (select d from start))::int as today,
            count(distinct a.company_id) filter (where a.kind = 'view' and a.at >= now() - interval '7 days')::int as week,
            coalesce(max(pm.peak), 0)::int as peak_minute,
            count(*) filter (where a.kind = 'search' and a.at >= now() - interval '24 hours')::int as searches_24h,
            max(a.at) as last_at
     from access_log a
     join profiles p on p.user_id = a.user_id
     left join memberships m on m.user_id = p.user_id
     left join organizations o on o.id = m.org_id
     left join per_minute pm on pm.user_id = p.user_id
     where a.at >= now() - interval '7 days'
     group by p.user_id, p.email, o.name
     order by today desc, week desc`,
  );
  return rows.map((r) => ({ ...r, last_at: r.last_at ? new Date(r.last_at).toISOString() : null })) as AccessRow[];
}
