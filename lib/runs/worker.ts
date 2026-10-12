import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { getCollector } from "@/lib/scrapers/registry";
import { CollectorError, type Json, type ScrapeMethod } from "@/lib/scrapers/types";
import { enrichDomain, fetchHome } from "@/lib/enrich/site";
import { isOutdated, type SiteAudit } from "@/lib/enrich/audit";
import { mapWithConcurrency } from "@/lib/concurrency";
import { BolagsverketError, isBolagsverketConfigured, isBolagsverketTest } from "@/lib/bolagsverket/client";
import { refreshRegistry } from "@/lib/bolagsverket/registry";
import { failRun, upsertItems } from "./store";

/**
 * Körningens tillståndsmaskin.
 *
 * EN KÖRNING ÖVERLEVER SIN ANROPSOMGÅNG. En route får köra högst 300 sekunder, och att läsa in 16 708
 * Bokadirekt-rader och sedan besöka hundratals webbplatser ryms inte. Därför spenderar arbetaren en
 * budget, skriver ner exakt hur långt den kom och lämnar över till nästa omgång (continue.ts).
 *
 *   ÅTERUPPTAGBAR  samlarens sida och berikningskön ligger i databasen, så nästa omgång fortsätter.
 *   IDEMPOTENT     upserten är nycklad på (dedupe_key, källa), så en omgång som skrivs två gånger ändrar inget.
 *   EXKLUSIV       en lease säger vilken omgång som äger körningen. Två arbetare på en körning dubblar alla tal.
 *
 * Skillnad mot gamla portalen: företagen är gemensamma för alla källor. Berikningen gäller därför bara
 * företag som den här källan ser (de har en signal för den), och görs en gång per företag.
 */

/** När arbetaren slutar STARTA arbete. Det som körs efter är högst ett sajtbesök eller ett registeranrop. */
const BUDGET_MS = 200_000;
const ENRICH_CHUNK = 10;
const ENRICH_CONCURRENCY = 5;
const AUDIT_CHUNK = 10;
const AUDIT_CONCURRENCY = 5;
/** Efterslapet av granskningar lämnas till nästa veckas körning härifrån, så att körningen inte slutar som "för många omgångar". */
const AUDIT_UNTIL_CHAIN = 40;
const REGISTRY_CHUNK = 20;
const REGISTRY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const UPSERT_CHUNK = 200;
const UPSERT_ATTEMPTS = 3;
/** En körning som behövt så här många omgångar gör inga framsteg. */
const MAX_CHAIN = 50;
/** Hur länge en annan omgångs lease respekteras. Kortare än 15-minutersregeln med flit. */
const LEASE_GRACE_MS = 2 * 60_000;

export type WorkerResult =
  | { kind: "done" }
  | { kind: "continue"; leaseToken: string }
  | { kind: "skipped"; reason: string };

interface Source { id: string; method: ScrapeMethod | null; config: unknown; enrich_sites: boolean; slug: string; name: string }

const SCOPE = `exists (select 1 from company_signals s where s.company_id = c.id and s.supplier_id = $1)`;

async function stillRunning(runId: string): Promise<boolean> {
  const { rows } = await pool.query(`select status from scrape_runs where id = $1`, [runId]);
  return !rows[0] || rows[0].status === "running";
}

const beat = (runId: string) => pool.query(`update scrape_runs set heartbeat_at = now() where id = $1`, [runId]);

export async function executeRun(runId: string, options: { budgetMs?: number; expectedLease?: string | null } = {}): Promise<WorkerResult> {
  const deadline = Date.now() + (options.budgetMs ?? BUDGET_MS);
  const leaseToken = randomUUID();

  // CLAIM. Ett uttalande avgör ägandet, så två omgångar som tävlar om samma körning inte båda kan vinna.
  const { rows: claimedRows } = await pool.query(
    `update scrape_runs set status = 'running', lease_token = $2, heartbeat_at = now(),
       chain_count = chain_count + 1, started_at = coalesce(started_at, now())
     where id = $1 and status in ('queued','running')
       and (lease_token is null or lease_token = $3 or heartbeat_at < now() - ($4 || ' milliseconds')::interval)
     returning *`,
    [runId, leaseToken, options.expectedLease ?? randomUUID(), String(LEASE_GRACE_MS)],
  );
  const claimed = claimedRows[0];
  if (!claimed) return { kind: "skipped", reason: "Körningen är avslutad eller ägs av en annan process." };

  if (claimed.chain_count > MAX_CHAIN) {
    await failRun(runId, "Körningen tog för många omgångar och avbröts.");
    return { kind: "done" };
  }

  const source: Source | undefined = (await pool.query(`select id, slug, name, method, config, enrich_sites from suppliers where id = $1`, [claimed.supplier_id])).rows[0];
  if (!source) {
    await failRun(runId, "Källan finns inte längre.");
    return { kind: "done" };
  }

  try {
    const state = { recordsFound: claimed.records_found as number, recordsNew: claimed.records_new as number, truncated: claimed.truncated as boolean, cursor: claimed.cursor as Json | null };

    if (claimed.stage === "collect") {
      if (!source.method) throw new CollectorError("Källan har ingen insamlingsmetod.");
      const outcome = await runCollectStage(runId, source as Source & { method: ScrapeMethod }, deadline, state);
      if (outcome === "budget") return { kind: "continue", leaseToken };
    }

    if ((await runEnrichStage(runId, source, deadline)) === "budget") return { kind: "continue", leaseToken };
    if ((await runAuditStage(runId, source, source.enrich_sites && claimed.chain_count < AUDIT_UNTIL_CHAIN, deadline)) === "budget") return { kind: "continue", leaseToken };
    if ((await runRegistryStage(runId, source, deadline)) === "budget") return { kind: "continue", leaseToken };

    await pool.query(`update scrape_runs set status = 'success', stage = 'done', finished_at = now(), heartbeat_at = now() where id = $1 and status = 'running'`, [runId]);
    return { kind: "done" };
  } catch (cause) {
    // Ett CollectorError bär en mening skriven för den som tryckte på knappen. Allt annat är en bugg.
    const message = cause instanceof CollectorError ? cause.message : `Oväntat fel: ${cause instanceof Error ? cause.message : "okänt"}`;
    await failRun(runId, message);
    return { kind: "done" };
  }
}

async function runCollectStage(
  runId: string,
  source: Source & { method: ScrapeMethod },
  deadline: number,
  state: { recordsFound: number; recordsNew: number; truncated: boolean; cursor: Json | null },
): Promise<"done" | "budget"> {
  const collector = getCollector(source.method);
  const config = collector.parseConfig(source.config);
  const controller = new AbortController();
  const context = {
    profile: { id: source.id, slug: source.slug, name: source.name, method: source.method, config: source.config, enrich_sites: source.enrich_sites },
    runId,
    cursor: state.cursor,
    signal: controller.signal,
    log: (message: string) => console.log(`[run ${runId}] ${message}`),
  };

  for await (const batch of collector.collect(config, context)) {
    if (batch.truncated) state.truncated = true;
    // Anteckningar läggs till (en körning har flera omgångar), och förbrukningen och räknarna summeras. Saknas kolumnerna
    // (migrationen 0016) hoppas räknarna över, och körningen går ändå.
    if (batch.note) await pool.query(`update scrape_runs set note = left(coalesce(note || ' ', '') || $2, 900) where id = $1`, [runId, batch.note]);
    if (batch.usage || batch.stats) await recordRunStats(runId, batch).catch((e) => console.error(`[run ${runId}] kunde inte spara räknarna:`, e instanceof Error ? e.message : e));

    for (let i = 0; i < batch.items.length; i += UPSERT_CHUNK) {
      const chunk = batch.items.slice(i, i + UPSERT_CHUNK);
      const { inserted } = await upsertWithRetry(source.id, runId, chunk);
      state.recordsFound += chunk.length;
      state.recordsNew += inserted;
    }

    state.cursor = batch.cursor;
    await pool.query(
      `update scrape_runs set records_found = $2, records_new = $3, truncated = $4, cursor = $5::jsonb, heartbeat_at = now() where id = $1`,
      [runId, state.recordsFound, state.recordsNew, state.truncated, JSON.stringify(state.cursor)],
    );

    // Markören skrevs just, så att stanna här förlorar ingenting.
    if (Date.now() >= deadline) {
      controller.abort();
      return batch.cursor === null ? finishCollect(runId) : "budget";
    }
    if (batch.cursor === null) break;
  }
  return finishCollect(runId);
}

async function recordRunStats(runId: string, batch: { usage?: { credits?: number; costSek?: number }; stats?: { checked: number; accepted: number; rejected: Record<string, number> } }): Promise<void> {
  const cur = (await pool.query(`select rejected from scrape_runs where id = $1`, [runId])).rows[0]?.rejected as Record<string, number> | null;
  const rejected = { ...(cur ?? {}) };
  for (const [k, n] of Object.entries(batch.stats?.rejected ?? {})) rejected[k] = (rejected[k] ?? 0) + n;
  await pool.query(
    `update scrape_runs set credits_used = coalesce(credits_used, 0) + $2, cost_sek = coalesce(cost_sek, 0) + $3,
       checked = coalesce(checked, 0) + $4, accepted = coalesce(accepted, 0) + $5, rejected = $6::jsonb where id = $1`,
    [runId, Math.round(batch.usage?.credits ?? 0), Math.round((batch.usage?.costSek ?? 0) * 100) / 100, batch.stats?.checked ?? 0, batch.stats?.accepted ?? 0, JSON.stringify(rejected)],
  );
}

async function finishCollect(runId: string): Promise<"done"> {
  await pool.query(`update scrape_runs set stage = 'enrich', cursor = null where id = $1`, [runId]);
  return "done";
}

async function upsertWithRetry(supplierId: string, runId: string, items: Parameters<typeof upsertItems>[2]) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await upsertItems(supplierId, runId, items);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const timedOut = err.code === "57014" || /statement timeout/i.test(err.message ?? "");
      if (!timedOut || attempt >= UPSERT_ATTEMPTS) throw new CollectorError(`Kunde inte spara posterna: ${err.message ?? "okänt fel"}`);
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
}

async function runEnrichStage(runId: string, source: Source, deadline: number): Promise<"done" | "budget"> {
  if (!source.enrich_sites) return "done";

  // Köns storlek noteras en gång när steget börjar, så att förloppet har en nämnare som inte rör sig.
  const pending = (await pool.query(`select count(*)::int n from companies c where c.enriched_at is null and c.domain is not null and ${SCOPE}`, [source.id])).rows[0].n as number;
  const cur = (await pool.query(`select enrich_total, enriched_count, enrich_failed from scrape_runs where id = $1`, [runId])).rows[0];
  let total = cur?.enrich_total ?? 0;
  let done = cur?.enriched_count ?? 0;
  let failed = cur?.enrich_failed ?? 0;
  if (total === 0 && pending > 0) {
    total = pending;
    await pool.query(`update scrape_runs set enrich_total = $2, stage = 'enrich' where id = $1`, [runId, total]);
  }

  while (Date.now() < deadline) {
    if (!(await stillRunning(runId))) return "done";

    const records = (await pool.query(
      `select c.id, c.domain from companies c where c.enriched_at is null and c.domain is not null and ${SCOPE} order by c.first_seen_at limit ${ENRICH_CHUNK}`,
      [source.id],
    )).rows as { id: string; domain: string }[];
    if (records.length === 0) return "done";

    // Ett besök som inte startat när tiden gått ut lämnas ifred; företaget leder kön nästa omgång.
    const results = await mapWithConcurrency(records, ENRICH_CONCURRENCY, async (record) => ({
      record,
      site: Date.now() < deadline ? await enrichDomain(record.domain) : null,
    }));

    for (const { record, site } of results) {
      if (!site) continue;
      // enriched_at sätts även vid fel: kön är "inte försökt än", annars skulle en domän som aldrig svarar köas för evigt.
      await applyEnrichment(record.id, {
        error: site.error, name: site.companyName, email: site.email, phone: site.phone, orgnr: site.orgnr, website: site.website,
        extra: site.emails.length > 0 || site.phones.length > 0 ? { emails: site.emails, phones: site.phones } : null,
        audit: site.audit,
      });
      if (site.error) failed++;
      done++;
    }

    await pool.query(`update scrape_runs set enriched_count = $2, enrich_failed = $3, enrich_total = $4, heartbeat_at = now() where id = $1`, [runId, done, failed, Math.max(total, done)]);
  }
  return "budget";
}

/**
 * Fyller bara det som är tomt på företaget: ett nummer från Bokadirekt-tabellen är bättre belägg än ett
 * från en sidfot. Granskningen är en ny titt på sajten och ersätter alltid det som fanns. Ett uttalande,
 * med coalesce, så att inget skrivs över mellan läsning och skrivning.
 */
async function applyEnrichment(
  companyId: string,
  u: { error: string | null; name: string | null; email: string | null; phone: string | null; orgnr: string | null; website: string | null; extra: unknown; audit: SiteAudit | null },
): Promise<void> {
  await pool.query(
    `update companies set enriched_at = now(), enrich_error = $2,
       name = coalesce(name, $3), email = coalesce(email, $4), phone = coalesce(phone, $5), orgnr = coalesce(orgnr, $6), website = coalesce(website, $7),
       enrichment = coalesce($8::jsonb, enrichment),
       site_audit = $9::jsonb, site_audited_at = now(), site_outdated = $10
     where id = $1`,
    [companyId, u.error, u.name, u.email, u.phone, u.orgnr, u.website, u.extra ? JSON.stringify(u.extra) : null, u.audit ? JSON.stringify(u.audit) : null, u.audit ? isOutdated(u.audit) : null],
  );
}

/** Granskningen för företag som berikades innan den fanns. Nya granskas av berikningen själv. */
async function runAuditStage(runId: string, source: Source, enabled: boolean, deadline: number): Promise<"done" | "budget"> {
  if (!enabled) return "done";
  while (Date.now() < deadline) {
    if (!(await stillRunning(runId))) return "done";
    const records = (await pool.query(
      `select c.id, c.domain, c.website from companies c where c.site_audited_at is null and c.domain is not null and c.enriched_at is not null and ${SCOPE} order by c.first_seen_at limit ${AUDIT_CHUNK}`,
      [source.id],
    )).rows as { id: string; domain: string; website: string | null }[];
    if (records.length === 0) return "done";

    const results = await mapWithConcurrency(records, AUDIT_CONCURRENCY, async (record) => ({
      record,
      started: Date.now() < deadline,
      home: Date.now() < deadline ? await fetchHome(record.domain, record.website) : null,
    }));
    for (const { record, started, home } of results) {
      if (!started) continue;
      const audit = home?.audit ?? null;
      await pool.query(`update companies set site_audit = $2::jsonb, site_audited_at = now(), site_outdated = $3 where id = $1`, [record.id, audit ? JSON.stringify(audit) : null, audit ? isOutdated(audit) : null]);
    }
    await beat(runId);
  }
  return "budget";
}

/**
 * Bolagsverkets registeruppgifter för företag med org.nr. Kör efter berikningen, som hittar de flesta org.nr.
 * FÅR ALDRIG FÄLLA KÖRNINGEN: en saknad eller nekad nyckel är ett konfigurationsproblem, inte ett skäl att
 * markera en källa som trasig. Hoppas över mot testmiljön, som nekar alla riktiga org.nr.
 */
async function runRegistryStage(runId: string, source: Source, deadline: number): Promise<"done" | "budget"> {
  if (!isBolagsverketConfigured() || isBolagsverketTest()) return "done";
  while (Date.now() < deadline) {
    if (!(await stillRunning(runId))) return "done";
    const records = (await pool.query(
      `select c.id, c.orgnr, c.registry from companies c
       where c.orgnr is not null and (c.registry_checked_at is null or c.registry_checked_at < now() - ($2 || ' milliseconds')::interval) and ${SCOPE}
       order by c.registry_checked_at nulls first limit ${REGISTRY_CHUNK}`,
      [source.id, String(REGISTRY_REFRESH_MS)],
    )).rows as { id: string; orgnr: string; registry: unknown }[];
    if (records.length === 0) return "done";

    for (const record of records) {
      if (Date.now() >= deadline) return "budget";
      try {
        await refreshRegistry(record, { withFigures: false });
        // refreshRegistry skriver bara när något ändrats; stämpla kontrollen så att kön tömmas.
        await pool.query(`update companies set registry_checked_at = now() where id = $1`, [record.id]);
      } catch (cause) {
        if (cause instanceof BolagsverketError && !cause.temporary) return "done";
        await pool.query(`update companies set registry_checked_at = now() where id = $1`, [record.id]);
      }
    }
    await beat(runId);
  }
  return "budget";
}
