import { pool } from "../db";
import { addDays, dateKey, startOfDayUtc } from "../time";
import { queueSeed, type DialerScope } from "./scope";
import { QUEUE_LIMIT } from "./constants";
import type { ClaimStatus } from "./claim";
import type { QueueOrder } from "./order";

export { QUEUE_ORDERS, type QueueOrder } from "./order";

export async function getQueueOrder(userId: string): Promise<QueueOrder> {
  const { rows } = await pool.query(`select queue_order from member_prefs where user_id = $1`, [userId]);
  return (rows[0]?.queue_order as QueueOrder | undefined) ?? "slump";
}

export async function setQueueOrder(userId: string, order: QueueOrder) {
  await pool.query(
    `insert into member_prefs (user_id, queue_order) values ($1,$2) on conflict (user_id) do update set queue_order = excluded.queue_order`,
    [userId, order],
  );
}

const CITY = `c.registry->'organisation'->'address'->>'city'`;

/**
 * Kön av företag-id, i ordning. Portad från scrape_dialer_queue, men per bolag.
 *
 *  - new: oringda, samt Ej svar/Upptaget utan datum som inte ringts i dag. Ett telefonnummer
 *    bara en gång, och inte om numret redan är omhändertaget (arkiverat, återkomst, möte,
 *    slutligt utfall eller ringt i dag) hos bolaget under något annat företag.
 *  - callbacks: mina återkomster som är förfallna eller infaller i dag.
 *  - mine: alla mina kontakter.
 * Andra säljares levande reservationer hoppas över i "new".
 */
export async function getQueueIds(orgId: string, userId: string, scope: DialerScope, order: QueueOrder, limit = QUEUE_LIMIT): Promise<string[]> {
  const today = dateKey(new Date());
  const todayStart = startOfDayUtc(today);
  const tomorrowStart = startOfDayUtc(addDays(today, 1));

  const args: unknown[] = [orgId, userId];
  const p = (v: unknown) => { args.push(v); return `$${args.length}`; };

  const filt: string[] = [];
  if (scope.profileSlug) {
    filt.push(`exists (select 1 from company_signals cs join suppliers s on s.id = cs.supplier_id and s.published
                       where cs.company_id = c.id and s.slug = ${p(scope.profileSlug)})`);
  } else {
    filt.push(`exists (select 1 from company_signals cs join suppliers s on s.id = cs.supplier_id and s.published where cs.company_id = c.id)`);
  }
  if (scope.city) filt.push(`${CITY} ilike ${p(`%${scope.city}%`)}`);
  if (scope.outdatedOnly) filt.push(`c.site_outdated`);
  const filters = filt.join(" and ");

  if (scope.mode === "callbacks") {
    const { rows } = await pool.query(
      `select c.id from contacts k join companies c on c.id = k.company_id
       where k.org_id = $1 and k.last_called_by = $2 and k.archived_at is null
         and k.next_callback_at is not null and k.next_callback_at < ${p(tomorrowStart)} and ${filters}
       order by k.next_callback_at limit ${Math.floor(limit)}`,
      args,
    );
    return rows.map((r) => r.id);
  }
  if (scope.mode === "mine") {
    const { rows } = await pool.query(
      `select c.id from contacts k join companies c on c.id = k.company_id
       where k.org_id = $1 and k.last_called_by = $2 and k.archived_at is null and ${filters}
       order by k.last_called_at desc nulls last limit ${Math.floor(limit)}`,
      args,
    );
    return rows.map((r) => r.id);
  }

  const ts = p(todayStart);
  // Fröet är en parameter bara när det används: en oanvänd parameter ger "bind message supplies N parameters".
  const orderBy =
    order === "slump" ? `md5(id::text || ${p(queueSeed(userId))})`
    : order === "namn" ? `name nulls last, id`
    : order === "ort" ? `city nulls last, name nulls last, id`
    : `first_seen_at desc nulls last, id`;
  const { rows } = await pool.query(
    `with handled as (
       select o.phone from contacts k join companies o on o.id = k.company_id
        where k.org_id = $1 and o.phone is not null
          and (k.archived_at is not null or k.next_callback_at is not null or k.meeting_at is not null
               or k.outcome not in ('no_answer','busy') or k.last_called_at >= ${ts})
     ),
     candidates as (
       select c.id, c.phone, c.name, ${CITY} as city, c.first_seen_at, k.outcome
         from companies c
         left join contacts k on k.company_id = c.id and k.org_id = $1
        where c.phone is not null
          and k.archived_at is null
          and (k.id is null or k.outcome is null
               or (k.outcome in ('no_answer','busy') and k.next_callback_at is null and k.last_called_at < ${ts}))
          and not exists (select 1 from claims cl where cl.org_id = $1 and cl.company_id = c.id
                          and cl.user_id <> $2 and cl.claimed_until > now())
          and c.phone not in (select phone from handled)
          and ${filters}
     ),
     one_per_phone as (
       select distinct on (phone) id, name, city, first_seen_at, outcome from candidates
        order by phone, (outcome is null), id
     )
     select id from one_per_phone
      order by (outcome is null), ${orderBy}
      limit ${Math.floor(limit)}`,
    args,
  );
  return rows.map((r) => r.id);
}

/** Tar företaget åt säljaren (lease 5 min) om ingen annan håller det. Släpper säljarens övriga. */
export async function claimCompany(orgId: string, userId: string, companyId: string): Promise<ClaimStatus> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from claims where org_id = $1 and user_id = $2 and company_id <> $3`, [orgId, userId, companyId]);
    const got = await client.query(
      `insert into claims (org_id, company_id, user_id, claimed_until) values ($1,$2,$3, now() + interval '5 minutes')
       on conflict (org_id, company_id) do update
         set user_id = excluded.user_id, claimed_until = excluded.claimed_until
         where claims.user_id = excluded.user_id or claims.claimed_until <= now()
       returning user_id`,
      [orgId, companyId, userId],
    );
    const claimed = got.rowCount === 1;
    const holder = claimed ? null : (await client.query(
      `select p.email from claims cl join profiles p on p.user_id = cl.user_id where cl.org_id = $1 and cl.company_id = $2`,
      [orgId, companyId],
    )).rows[0]?.email ?? null;
    const last = (await client.query(
      `select outcome, last_called_at, last_called_by, last_called_by_email from contacts where org_id = $1 and company_id = $2`,
      [orgId, companyId],
    )).rows[0] as { outcome: string | null; last_called_at: Date | null; last_called_by: string | null; last_called_by_email: string | null } | undefined;
    await client.query("commit");
    return {
      claimed,
      holderEmail: holder,
      lastCalledAt: last?.last_called_at ? last.last_called_at.toISOString() : null,
      lastCalledByEmail: last && last.last_called_by !== userId ? last.last_called_by_email : null,
      callStatus: (last?.outcome as ClaimStatus["callStatus"]) ?? null,
    };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function releaseClaims(orgId: string, userId: string) {
  await pool.query(`delete from claims where org_id = $1 and user_id = $2`, [orgId, userId]);
}
