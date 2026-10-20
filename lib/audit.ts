import { pool } from "./db";
import type { AuditRow } from "./audit-describe";
import { groupPrefixes } from "./audit-describe";

type Actor = { id: string | null; email: string };

/**
 * Skriver en rad i aktivitetsloggen. Anropas efter en lyckad adminåtgärd. Misslyckas loggningen
 * stoppar det inte åtgärden (den är redan gjord), felet skrivs bara till serverloggen.
 */
export async function audit(
  actor: Actor,
  action: string,
  entity: "org" | "user" | "source" | "category" | "invite" | "company",
  target: { id?: string | null; name?: string | null; details?: Record<string, unknown> | null } = {},
): Promise<void> {
  try {
    await pool.query(
      `insert into audit_log (actor_id, actor_email, action, entity, entity_id, entity_name, details) values ($1,$2,$3,$4,$5,$6,$7)`,
      [actor.id, actor.email, action, entity, target.id ?? null, target.name ?? null, target.details ? JSON.stringify(target.details) : null],
    );
  } catch (e) {
    console.error("Kunde inte skriva i aktivitetsloggen", action, e);
  }
}

export type AuditFilter = { group?: string | null; actor?: string | null; entity?: string | null; entityId?: string | null; q?: string | null };

const SELECT = `select id, at, actor_email, action, entity, entity_id, entity_name, details from audit_log`;

function where(f: AuditFilter, args: unknown[]) {
  const cond: string[] = [];
  const prefixes = groupPrefixes(f.group);
  if (prefixes) {
    args.push(prefixes.map((p) => `${p}%`));
    cond.push(`action like any($${args.length}::text[])`);
  }
  if (f.actor) { args.push(f.actor.toLowerCase()); cond.push(`lower(actor_email) = $${args.length}`); }
  if (f.entity && f.entityId) { args.push(f.entity, f.entityId); cond.push(`entity = $${args.length - 1} and entity_id = $${args.length}`); }
  if (f.q?.trim()) { args.push(`%${f.q.trim().toLowerCase()}%`); cond.push(`(lower(coalesce(entity_name,'')) like $${args.length} or lower(coalesce(details->>'email','')) like $${args.length})`); }
  return cond.length ? `where ${cond.join(" and ")}` : "";
}

const toRow = (r: Record<string, unknown>): AuditRow => ({
  id: Number(r.id), at: new Date(r.at as string).toISOString(), actor_email: r.actor_email as string, action: r.action as string,
  entity: r.entity as string, entity_id: (r.entity_id as string | null) ?? null, entity_name: (r.entity_name as string | null) ?? null,
  details: (r.details as Record<string, unknown> | null) ?? null,
});

/** En sida av loggen, nyast först. `cursor` är "<tid>|<id>" för den sista raden på föregående sida. */
export async function listAudit(f: AuditFilter, opts: { cursor?: string | null; limit?: number } = {}): Promise<{ rows: AuditRow[]; next: string | null }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const args: unknown[] = [];
  let w = where(f, args);
  const m = /^(.+)\|(\d+)$/.exec(opts.cursor ?? "");
  if (m) {
    args.push(m[1], Number(m[2]));
    w += `${w ? " and" : "where"} (at, id) < ($${args.length - 1}::timestamptz, $${args.length}::bigint)`;
  }
  const { rows } = await pool.query(`${SELECT} ${w} order by at desc, id desc limit ${limit + 1}`, args);
  const page = rows.slice(0, limit).map(toRow);
  const last = page[page.length - 1];
  return { rows: page, next: rows.length > limit && last ? `${last.at}|${last.id}` : null };
}

export async function recentAudit(limit = 5): Promise<AuditRow[]> {
  return (await listAudit({}, { limit })).rows;
}

/** Personerna som förekommit i loggen, för filtret. */
export async function auditActors(): Promise<string[]> {
  const { rows } = await pool.query(`select distinct actor_email from audit_log order by 1`);
  return rows.map((r) => r.actor_email as string);
}
