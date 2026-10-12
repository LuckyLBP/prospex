import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { RunStartError } from "./errors";
import { cancelRun, requeueEnrichment, runHistory, startRun, sweepStaleRuns, upsertItems } from "./store";

const SLUG = "run-itest";
const KEYS = ["zz-itest-a.se", "zz-itest-b.se", "itest:77"];
let supplierId = "";

beforeAll(async () => {
  supplierId = (await pool.query(
    `insert into suppliers (id, slug, name, kind, method, config, published) values (gen_random_uuid(), $1, 'Run Itest', 'supplier', 'domainlist', '{"domains":"a.se"}', false) returning id`,
    [SLUG],
  )).rows[0].id;
});

afterAll(async () => {
  await pool.query(`delete from suppliers where slug = $1`, [SLUG]); // cascade: runs och signaler
  await pool.query(`delete from companies where dedupe_key = any($1)`, [KEYS]);
  await pool.end();
});

const item = (key: string, extra: Record<string, unknown> = {}) => ({ dedupeKey: key, domain: key.includes(".") ? key : null, ...extra });

describe("upsertItems", () => {
  it("creates companies and signals, and counts only new signals", async () => {
    const run = await startRun(supplierId);
    const r = await upsertItems(supplierId, run, [item(KEYS[0], { companyName: "A AB", phone: "+4631111111" }), item(KEYS[1]), item(KEYS[2], { companyName: "Utan domän" })]);
    expect(r.inserted).toBe(3);
    const sigs = (await pool.query(`select count(*)::int n from company_signals where supplier_id = $1`, [supplierId])).rows[0].n;
    expect(sigs).toBe(3);
    // Nya företag ska ha datum för första och senaste observation.
    const undated = (await pool.query(`select count(*)::int n from companies where dedupe_key = any($1) and (first_seen_at is null or last_seen_at is null)`, [KEYS])).rows[0].n;
    expect(undated).toBe(0);
    await cancelRun(run);
  });

  it("is idempotent and never blanks or overwrites a known value", async () => {
    const run = await startRun(supplierId);
    const r = await upsertItems(supplierId, run, [item(KEYS[0], { companyName: "Annat namn", phone: null }), item(KEYS[0], { companyName: "Dubblett i samma omgång" })]);
    expect(r.inserted).toBe(0);
    const c = (await pool.query(`select name, phone from companies where dedupe_key = $1`, [KEYS[0]])).rows[0];
    expect(c).toEqual({ name: "A AB", phone: "+4631111111" });
    await cancelRun(run);
  });

  it("marks prefilled items as enriched and leaves the others in the queue", async () => {
    const run = await startRun(supplierId);
    await upsertItems(supplierId, run, [item("zz-itest-c.se", { prefilled: true })]);
    const c = (await pool.query(`select enriched_at from companies where dedupe_key = 'zz-itest-c.se'`)).rows[0];
    expect(c.enriched_at).not.toBeNull();
    const queued = (await pool.query(`select count(*)::int n from companies c where c.enriched_at is null and c.domain is not null and exists (select 1 from company_signals s where s.company_id = c.id and s.supplier_id = $1)`, [supplierId])).rows[0].n;
    expect(queued).toBe(2); // a och b, men inte den förifyllda c
    await pool.query(`delete from companies where dedupe_key = 'zz-itest-c.se'`);
    await cancelRun(run);
  });

  it("sets last_seen_at on a repeat sighting", async () => {
    await pool.query(`update company_signals set last_seen_at = now() - interval '3 days' where supplier_id = $1`, [supplierId]);
    const run = await startRun(supplierId);
    await upsertItems(supplierId, run, [item(KEYS[1])]);
    const fresh = (await pool.query(`select count(*)::int n from company_signals where supplier_id = $1 and last_seen_at > now() - interval '1 minute'`, [supplierId])).rows[0].n;
    expect(fresh).toBe(1);
    await cancelRun(run);
  });
});

describe("runs", () => {
  it("refuses a second active run for the same source", async () => {
    const first = await startRun(supplierId);
    await expect(startRun(supplierId)).rejects.toMatchObject({ code: "ACTIVE" });
    expect(await cancelRun(first)).toBe(true);
    expect(await cancelRun(first)).toBe(false); // redan avslutad
    const again = await startRun(supplierId); // går igen efter avbrott
    await cancelRun(again);
  });

  it("refuses a source without a method and one that does not exist", async () => {
    await pool.query(`update suppliers set method = null where id = $1`, [supplierId]);
    await expect(startRun(supplierId)).rejects.toMatchObject({ code: "NO_METHOD" });
    await pool.query(`update suppliers set method = 'domainlist' where id = $1`, [supplierId]);
    await expect(startRun("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(RunStartError);
  });

  it("sweeps a run with no heartbeat for 15 minutes, and lets the source run again", async () => {
    const run = await startRun(supplierId);
    await pool.query(`update scrape_runs set status = 'running', heartbeat_at = now() - interval '20 minutes' where id = $1`, [run]);
    expect(await sweepStaleRuns()).toBeGreaterThanOrEqual(1);
    const row = (await pool.query(`select status, error from scrape_runs where id = $1`, [run])).rows[0];
    expect(row.status).toBe("error");
    expect(row.error).toMatch(/15 minuter/);
    const next = await startRun(supplierId);
    await cancelRun(next);
  });

  it("lists the history newest first, and requeues failed enrichment for this source only", async () => {
    const hist = await runHistory(supplierId);
    expect(hist.length).toBeGreaterThanOrEqual(3);
    expect(new Date(hist[0].created_at).getTime()).toBeGreaterThanOrEqual(new Date(hist[hist.length - 1].created_at).getTime());
    await pool.query(`update companies set enrich_error = 'timeout', enriched_at = now() where dedupe_key = $1`, [KEYS[1]]);
    expect(await requeueEnrichment(supplierId)).toBe(1);
    const c = (await pool.query(`select enriched_at, enrich_error from companies where dedupe_key = $1`, [KEYS[1]])).rows[0];
    expect(c).toEqual({ enriched_at: null, enrich_error: null });
  });
});
