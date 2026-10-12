import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import type { CollectedItem } from "@/lib/scrapers/types";
import { START_ERRORS, RunStartError } from "./errors";
import { STALE_AFTER_MS, STALE_ERROR, type RunLike } from "./status";

// Körningarnas databaslager. Allt går via pg, och källans företag är de som har en signal för den.

export type Stage = "collect" | "enrich";

export interface RunRow extends RunLike {
  id: string;
  supplier_id: string;
  triggered_by: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  enrich_failed: number;
  records_new: number;
  truncated: boolean;
  /** Något körningen gick förbi, till exempel en källa som hoppades över. */
  note: string | null;
}

const RUN_COLS = `id, supplier_id, status, stage, triggered_by, created_at, started_at, heartbeat_at, finished_at, records_found, records_new, enrich_total, enriched_count, enrich_failed, truncated, error, note`;

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const toRun = (r: Record<string, unknown>): RunRow => ({
  ...(r as unknown as RunRow),
  created_at: iso(r.created_at)!,
  started_at: iso(r.started_at),
  heartbeat_at: iso(r.heartbeat_at),
  finished_at: iso(r.finished_at),
});

/**
 * Skapar en körning i kö. Låser källans rad så att två som trycker samtidigt inte båda startar,
 * och vägrar om en aktiv körning har haft puls de senaste 15 minuterna.
 */
export async function startRun(supplierId: string, opts: { stage?: Stage; triggeredBy?: string | null } = {}): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const src = (await client.query(`select id, method from suppliers where id = $1 for update`, [supplierId])).rows[0];
    if (!src) throw new RunStartError("NOT_FOUND", START_ERRORS.NOT_FOUND);
    if (!src.method) throw new RunStartError("NO_METHOD", START_ERRORS.NO_METHOD);
    const active = await client.query(
      `select 1 from scrape_runs where supplier_id = $1 and status in ('queued','running') and coalesce(heartbeat_at, created_at) > now() - ($2 || ' milliseconds')::interval limit 1`,
      [supplierId, String(STALE_AFTER_MS)],
    );
    if (active.rowCount) throw new RunStartError("ACTIVE", START_ERRORS.ACTIVE);
    const run = await client.query(
      `insert into scrape_runs (supplier_id, status, stage, triggered_by) values ($1, 'queued', $2, $3) returning id`,
      [supplierId, opts.stage ?? "collect", opts.triggeredBy ?? null],
    );
    await client.query("commit");
    return run.rows[0].id as string;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Avbryter en pågående körning. Arbetaren stannar mellan två omgångar. */
export async function cancelRun(runId: string): Promise<boolean> {
  const r = await pool.query(
    `update scrape_runs set status = 'error', error = 'Avbruten av administratör.', finished_at = now(), heartbeat_at = now() where id = $1 and status in ('queued','running')`,
    [runId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function failRun(runId: string, message: string): Promise<void> {
  await pool.query(
    `update scrape_runs set status = 'error', error = $2, finished_at = now(), heartbeat_at = now() where id = $1`,
    [runId, message.slice(0, 1000)],
  );
}

/** Markerar körningar utan puls i 15 minuter som döda, så att källan går att köra igen. */
export async function sweepStaleRuns(): Promise<number> {
  const r = await pool.query(
    `update scrape_runs set status = 'error', error = $2, finished_at = now()
     where status in ('queued','running') and coalesce(heartbeat_at, created_at) < now() - ($1 || ' milliseconds')::interval`,
    [String(STALE_AFTER_MS), STALE_ERROR],
  );
  return r.rowCount ?? 0;
}

export async function runHistory(supplierId: string, limit = 20): Promise<RunRow[]> {
  const { rows } = await pool.query(`select ${RUN_COLS} from scrape_runs where supplier_id = $1 order by created_at desc limit $2`, [supplierId, limit]);
  return rows.map(toRun);
}

/** Senaste körningen per källa, för Insamling-sidan. */
export async function latestRuns(): Promise<Map<string, RunRow>> {
  const { rows } = await pool.query(`select distinct on (supplier_id) ${RUN_COLS} from scrape_runs order by supplier_id, created_at desc`);
  return new Map(rows.map((r) => [r.supplier_id as string, toRun(r)]));
}

/** Hur många gånger källan startats i dag (svensk tid) och hur många av dem som var PublicWWW. */
export async function todaysRuns(): Promise<{ total: number; publicwww: number }> {
  const { rows } = await pool.query(
    `select count(*)::int as total, count(*) filter (where s.method = 'publicwww')::int as publicwww
     from scrape_runs r join suppliers s on s.id = r.supplier_id
     where r.triggered_by is null and r.created_at >= (date_trunc('day', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm')`,
  );
  return rows[0];
}

/**
 * När källan senast hämtades: senaste körningens start, annars den senaste signalen vi sett
 * (så att historik från före Prospex räknas). Underlag för schemat och Insamling-sidan.
 */
export async function lastCollectBySupplier(): Promise<Map<string, string>> {
  const { rows } = await pool.query(
    `select s.id as supplier_id, coalesce(
       (select max(r.started_at) from scrape_runs r where r.supplier_id = s.id and r.started_at is not null and r.created_at > now() - interval '30 days'),
       (select max(cs.last_seen_at) from company_signals cs where cs.supplier_id = s.id)
     ) as at from suppliers s`,
  );
  return new Map(rows.filter((r) => r.at).map((r) => [r.supplier_id as string, new Date(r.at).toISOString()]));
}

/**
 * Sparar en omgång företag. Ett anrop: företagen läggs in eller fylls på (ett känt värde töms aldrig),
 * därefter signalen "den här källan ser företaget". Idempotent på (dedupe_key, källa). Returnerar
 * hur många signaler som är nya för källan.
 */
export async function upsertItems(supplierId: string, runId: string, items: CollectedItem[], client?: PoolClient): Promise<{ inserted: number }> {
  if (items.length === 0) return { inserted: 0 };
  const payload = items.map((i) => ({
    dedupe_key: i.dedupeKey, domain: i.domain, company_name: i.companyName ?? null, phone: i.phone ?? null, email: i.email ?? null,
    orgnr: i.orgnr ?? null, website: i.website ?? null, source_url: i.sourceUrl ?? null, raw: i.raw ?? null, prefilled: i.prefilled ?? false,
  }));
  const q = (client ?? pool).query.bind(client ?? pool);
  const { rows } = await q(
    `with items as (
       select distinct on (dedupe_key) * from jsonb_to_recordset($1::jsonb)
         as x(dedupe_key text, domain text, company_name text, phone text, email text, orgnr text, website text, source_url text, raw jsonb, prefilled boolean)
       order by dedupe_key
     ), up as (
       insert into companies (dedupe_key, domain, name, phone, email, orgnr, website, enriched_at, first_seen_at, last_seen_at)
       select dedupe_key, domain, company_name, phone, email, orgnr, website, case when prefilled then now() end, now(), now() from items
       on conflict (dedupe_key) do update set
         domain = coalesce(companies.domain, excluded.domain), name = coalesce(companies.name, excluded.name),
         phone = coalesce(companies.phone, excluded.phone), email = coalesce(companies.email, excluded.email),
         orgnr = coalesce(companies.orgnr, excluded.orgnr), website = coalesce(companies.website, excluded.website),
         last_seen_at = now()
       returning id, dedupe_key
     ), sig as (
       insert into company_signals (company_id, supplier_id, source_url, raw, source_run_id, first_seen_at, last_seen_at)
       select up.id, $2, i.source_url, i.raw, $3, now(), now() from up join items i using (dedupe_key)
       on conflict (company_id, supplier_id) do update set
         last_seen_at = now(), source_run_id = excluded.source_run_id,
         source_url = coalesce(excluded.source_url, company_signals.source_url), raw = coalesce(excluded.raw, company_signals.raw)
       returning (xmax = 0) as inserted
     ) select count(*) filter (where inserted)::int as inserted from sig`,
    [JSON.stringify(payload), supplierId, runId],
  );
  return { inserted: rows[0].inserted as number };
}

/** Sätter tillbaka företag som misslyckades så att nästa körning försöker igen. Returnerar antal. */
export async function requeueEnrichment(supplierId: string): Promise<number> {
  const r = await pool.query(
    `update companies c set enriched_at = null, enrich_error = null
     where c.enrich_error is not null and exists (select 1 from company_signals s where s.company_id = c.id and s.supplier_id = $1)`,
    [supplierId],
  );
  return r.rowCount ?? 0;
}

export async function failedEnrichmentCount(supplierId: string): Promise<number> {
  const { rows } = await pool.query(
    `select count(*)::int n from companies c where c.enrich_error is not null and exists (select 1 from company_signals s where s.company_id = c.id and s.supplier_id = $1)`,
    [supplierId],
  );
  return rows[0].n;
}
