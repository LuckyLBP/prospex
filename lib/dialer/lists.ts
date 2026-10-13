import { pool } from "../db";
import type { QueueOrder } from "./order";
import { normalizeScope, type DialerScope } from "./scope";

// Den aktiva listan i "Att ringa", en per person och bolag. Se migrationen 0021_dialer_lists.sql.

export interface SavedList {
  scope: DialerScope;
  order: QueueOrder;
  ids: string[];
  currentId: string | null;
  completed: boolean;
}

export async function loadList(orgId: string, userId: string): Promise<SavedList | null> {
  const { rows } = await pool.query(`select scope, queue_order, ids, current_id, completed_at from dialer_lists where org_id = $1 and user_id = $2`, [orgId, userId]);
  const r = rows[0];
  if (!r) return null;
  return { scope: normalizeScope(r.scope as Record<string, unknown>), order: r.queue_order as QueueOrder, ids: r.ids as string[], currentId: (r.current_id as string | null) ?? null, completed: r.completed_at !== null };
}

/** Sparar en nyligen byggd lista som den aktiva. Den gamla ersätts. */
export async function saveNewList(orgId: string, userId: string, scope: DialerScope, order: QueueOrder, ids: readonly string[]): Promise<void> {
  await pool.query(
    `insert into dialer_lists (org_id, user_id, scope, queue_order, ids, current_id, built_at, updated_at, completed_at)
     values ($1,$2,$3::jsonb,$4,$5::uuid[],$6, now(), now(), null)
     on conflict (org_id, user_id) do update set scope = excluded.scope, queue_order = excluded.queue_order, ids = excluded.ids,
       current_id = excluded.current_id, built_at = now(), updated_at = now(), completed_at = null`,
    [orgId, userId, JSON.stringify(scope), order, ids, ids[0] ?? null],
  );
}

/** Var i listan den som ringer är. Bara ett företag som finns i listan tas emot. */
export async function savePosition(orgId: string, userId: string, companyId: string): Promise<void> {
  await pool.query(`update dialer_lists set current_id = $3, updated_at = now() where org_id = $1 and user_id = $2 and $3 = any(ids) and completed_at is null`, [orgId, userId, companyId]);
}

/** Listan är slut. Nästa besök bygger en ny lista med samma urval. */
export async function finishList(orgId: string, userId: string): Promise<void> {
  await pool.query(`update dialer_lists set completed_at = now(), updated_at = now() where org_id = $1 and user_id = $2 and completed_at is null`, [orgId, userId]);
}
