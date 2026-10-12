import { pool } from "@/lib/db";
import type { ProfileInput } from "./input";

// Profilernas databaslager. Profilen byggs i en omgång (lib/profile/build.ts), och raden bär status, steg och puls
// så att sidan kan visa förloppet och så att ett jobb som dött går att se.

export type { ProfileStage } from "./stages";
export { STAGE_LABEL } from "./stages";
import type { ProfileStage } from "./stages";
export type ProfileStatus = "queued" | "running" | "done" | "error";

/** Hur länge en profil kan sakna puls innan den räknas som död. */
export const DEAD_AFTER_MS = 5 * 60_000;
/** En körning som just startats, eller en profil som just blev klar, används igen i stället för att byggas om. */
export const REUSE_RUNNING_MS = 2 * 60_000;
export const REUSE_DONE_MS = 60_000;
/** En skanning av ett utpekat katalogföretag byggs inte om så länge dess profil är yngre än så här. Det håller kostnaden nere. */
export const REUSE_COMPANY_MS = 30 * 24 * 3600_000;
export const MAX_RUNNING = 3;
export const MAX_PER_ADMIN_PER_HOUR = 30;
export const DEAD_ERROR = "Avbröts: ingen aktivitet på 5 minuter.";

export interface ProfileRow {
  id: string;
  company_id: string | null;
  input: string;
  input_kind: "url" | "orgnr";
  orgnr: string | null;
  sole_trader: boolean;
  domain: string | null;
  name: string | null;
  status: ProfileStatus;
  stage: ProfileStage | null;
  profile: unknown;
  facts: unknown;
  pages: unknown;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  steps: number | null;
  duration_ms: number | null;
  warnings: string[];
  error: string | null;
  requested_by: string | null;
  target_company_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export class ProfileStartError extends Error {
  constructor(readonly code: "BUSY" | "RATE" | "RUNNING" | "NOT_FOUND", message: string) {
    super(message);
    this.name = "ProfileStartError";
  }
}

const COLS = `id, company_id, input, input_kind, orgnr, sole_trader, domain, name, status, stage, profile, facts, pages, model, input_tokens, output_tokens, steps, duration_ms, warnings, error, requested_by, target_company_id, created_at, started_at, finished_at`;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const toRow = (r: Record<string, unknown>): ProfileRow => ({ ...(r as unknown as ProfileRow), created_at: iso(r.created_at)!, started_at: iso(r.started_at), finished_at: iso(r.finished_at) });

type Parsed = Extract<ProfileInput, { kind: "orgnr" | "url" }>;

/**
 * Skapar en profil i kö, eller ger tillbaka en som redan byggs eller nyss blev klar för samma webbplats eller
 * företag. En enskild firma slås inte ihop med andra: det maskade numret delas av alla med samma födelsedatum.
 */
export async function startProfile(input: Parsed, by: { id: string | null; orgId?: string | null }, opts: { targetCompanyId?: string | null } = {}): Promise<{ id: string; reused: boolean }> {
  await sweepDeadProfiles();
  const target = opts.targetCompanyId ?? null;
  if (target) {
    // Företaget har redan en färsk profil, eller en som byggs just nu: använd den i stället för att bygga en till.
    const { rows } = await pool.query(
      `select id from company_profiles
       where (company_id = $1 and status = 'done' and finished_at > now() - ($2 || ' milliseconds')::interval)
          or (target_company_id = $1 and status in ('queued','running') and coalesce(heartbeat_at, created_at) > now() - ($3 || ' milliseconds')::interval)
       order by (status = 'done') desc, coalesce(finished_at, created_at) desc limit 1`,
      [target, String(REUSE_COMPANY_MS), String(REUSE_RUNNING_MS)],
    );
    if (rows[0]) {
      await grantOrgAccess(rows[0].id, by.orgId);
      return { id: rows[0].id, reused: true };
    }
  }
  const domain = input.kind === "url" ? input.domain : null;
  const orgnr = input.kind === "orgnr" ? input.display : null;
  const sole = input.kind === "orgnr" && input.soleTrader;

  if (!sole) {
    const { rows } = await pool.query(
      `select id from company_profiles
       where ((domain = $1 and $1 is not null) or (orgnr = $2 and $2 is not null and not sole_trader))
         and ((status in ('queued','running') and coalesce(heartbeat_at, created_at) > now() - ($3 || ' milliseconds')::interval)
           or (status = 'done' and finished_at > now() - ($4 || ' milliseconds')::interval))
       order by created_at desc limit 1`,
      [domain, orgnr, String(REUSE_RUNNING_MS), String(REUSE_DONE_MS)],
    );
    if (rows[0]) {
      await grantOrgAccess(rows[0].id, by.orgId);
      return { id: rows[0].id, reused: true };
    }
  }

  const busy = (await pool.query(`select count(*)::int n from company_profiles where status in ('queued','running')`)).rows[0].n as number;
  if (busy >= MAX_RUNNING) throw new ProfileStartError("BUSY", `${MAX_RUNNING} profiler byggs redan. Försök igen om en stund.`);
  const recent = (await pool.query(`select count(*)::int n from company_profiles where requested_by is not distinct from $1 and created_at > now() - interval '1 hour'`, [by.id])).rows[0].n as number;
  if (recent >= MAX_PER_ADMIN_PER_HOUR) throw new ProfileStartError("RATE", `Du har skapat ${MAX_PER_ADMIN_PER_HOUR} profiler den senaste timmen. Vänta en stund.`);

  const created = await pool.query(
    `insert into company_profiles (input, input_kind, orgnr, sole_trader, domain, requested_by, target_company_id) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [input.kind === "url" ? input.domain : input.display, input.kind, orgnr, sole, domain, by.id, target],
  );
  await grantOrgAccess(created.rows[0].id as string, by.orgId);
  return { id: created.rows[0].id as string, reused: false };
}

/** Gör en profil synlig för ett bolag. Admin har ingen bolagskoppling och behöver inget. */
export async function grantOrgAccess(profileId: string, orgId: string | null | undefined): Promise<void> {
  if (!orgId) return;
  await pool.query(`insert into profile_org_access (profile_id, org_id) values ($1, $2) on conflict do nothing`, [profileId, orgId]);
}

/** Profilerna ett bolag ser, de senaste först. */
export async function orgProfiles(orgId: string, limit = 50): Promise<Omit<ProfileRow, "profile" | "facts" | "pages">[]> {
  const { rows } = await pool.query(
    `select ${COLS.split(", ").filter((c) => !["profile", "facts", "pages"].includes(c)).map((c) => `p.${c}`).join(", ")}
     from company_profiles p join profile_org_access a on a.profile_id = p.id
     where a.org_id = $1 order by coalesce(p.finished_at, p.created_at) desc limit $2`,
    [orgId, limit],
  );
  return rows.map(toRow) as Omit<ProfileRow, "profile" | "facts" | "pages">[];
}

/** En profil, bara om bolaget har fått den. */
export async function getOrgProfile(id: string, orgId: string): Promise<ProfileRow | null> {
  const { rows } = await pool.query(`select ${COLS.split(", ").map((c) => `p.${c}`).join(", ")} from company_profiles p join profile_org_access a on a.profile_id = p.id where p.id = $1 and a.org_id = $2`, [id, orgId]);
  return rows[0] ? toRow(rows[0]) : null;
}

/** Sätter en färdig eller felad profil i kö igen (Uppdatera). Den gamla profilen ligger kvar tills den nya är klar. */
export async function requeueProfile(id: string, by: { id: string | null }): Promise<void> {
  await sweepDeadProfiles();
  const busy = (await pool.query(`select count(*)::int n from company_profiles where status in ('queued','running')`)).rows[0].n as number;
  if (busy >= MAX_RUNNING) throw new ProfileStartError("BUSY", `${MAX_RUNNING} profiler byggs redan. Försök igen om en stund.`);
  const r = await pool.query(
    `update company_profiles set status = 'queued', stage = null, error = null, started_at = null, heartbeat_at = null, finished_at = null, requested_by = $2
     where id = $1 and status in ('done','error') returning id`,
    [id, by.id],
  );
  if (!r.rowCount) {
    const exists = (await pool.query(`select 1 from company_profiles where id = $1`, [id])).rowCount;
    throw new ProfileStartError(exists ? "RUNNING" : "NOT_FOUND", exists ? "Profilen byggs redan." : "Profilen finns inte.");
  }
}

export async function markRunning(id: string): Promise<boolean> {
  const r = await pool.query(`update company_profiles set status = 'running', started_at = coalesce(started_at, now()), heartbeat_at = now() where id = $1 and status in ('queued','running')`, [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function setStage(id: string, stage: ProfileStage): Promise<void> {
  await pool.query(`update company_profiles set stage = $2, heartbeat_at = now() where id = $1 and status = 'running'`, [id, stage]);
}

export async function setIdentity(id: string, v: { companyId?: string | null; name?: string | null; domain?: string | null; orgnr?: string | null }): Promise<void> {
  await pool.query(
    `update company_profiles set name = coalesce($2, name), domain = coalesce($3, domain), orgnr = coalesce($4, orgnr), heartbeat_at = now() where id = $1`,
    [id, v.name ?? null, v.domain ?? null, v.orgnr ?? null],
  );
}

export interface FinishData {
  companyId: string | null;
  name: string | null;
  orgnr: string | null;
  domain: string | null;
  profile: unknown;
  facts: unknown;
  pages: unknown;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  steps: number | null;
  durationMs: number;
  warnings: string[];
}

/**
 * Sparar en färdig profil. Ett företag har en profil: finns en äldre rad för samma företag (till exempel byggd
 * från en webbadress medan den nya kom från org.nr) tas den bort, så att den nyaste gäller.
 */
export async function finishProfile(id: string, d: FinishData): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (d.companyId) {
      // Bolagen som såg den äldre profilen ser den nya i stället för att tappa åtkomsten när den gamla tas bort.
      await client.query(
        `insert into profile_org_access (profile_id, org_id) select $2, a.org_id from profile_org_access a join company_profiles p on p.id = a.profile_id where p.company_id = $1 and p.id <> $2 on conflict do nothing`,
        [d.companyId, id],
      );
      await client.query(`delete from company_profiles where company_id = $1 and id <> $2`, [d.companyId, id]);
    }
    await client.query(
      `update company_profiles set status = 'done', stage = null, company_id = $2, name = coalesce($3, name), orgnr = coalesce($4, orgnr), domain = coalesce($5, domain),
         profile = $6::jsonb, facts = $7::jsonb, pages = $8::jsonb, model = $9, input_tokens = $10, output_tokens = $11, steps = $12, duration_ms = $13,
         warnings = $14, error = null, finished_at = now(), heartbeat_at = now()
       where id = $1`,
      [id, d.companyId, d.name, d.orgnr, d.domain, JSON.stringify(d.profile), JSON.stringify(d.facts), JSON.stringify(d.pages), d.model, d.inputTokens, d.outputTokens, d.steps, d.durationMs, d.warnings],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function failProfile(id: string, message: string): Promise<void> {
  await pool.query(`update company_profiles set status = 'error', error = $2, finished_at = now(), heartbeat_at = now() where id = $1`, [id, message.slice(0, 1000)]);
}

/** Profiler utan puls i 5 minuter har dött; markeras som fel så att de går att bygga om. */
export async function sweepDeadProfiles(): Promise<number> {
  const r = await pool.query(
    `update company_profiles set status = 'error', error = $2, finished_at = now()
     where status in ('queued','running') and coalesce(heartbeat_at, created_at) < now() - ($1 || ' milliseconds')::interval`,
    [String(DEAD_AFTER_MS), DEAD_ERROR],
  );
  return r.rowCount ?? 0;
}

export async function getProfile(id: string): Promise<ProfileRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await pool.query(`select ${COLS} from company_profiles where id = $1`, [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

/** De senaste profilerna utan den tunga profilen och beläggen, för tabellen. */
export async function recentProfiles(limit = 50): Promise<Omit<ProfileRow, "profile" | "facts" | "pages">[]> {
  const { rows } = await pool.query(
    `select id, company_id, input, input_kind, orgnr, sole_trader, domain, name, status, stage, model, input_tokens, output_tokens, steps, duration_ms, warnings, error, requested_by, created_at, started_at, finished_at
     from company_profiles order by coalesce(finished_at, created_at) desc limit $1`,
    [limit],
  );
  return rows.map(toRow) as Omit<ProfileRow, "profile" | "facts" | "pages">[];
}
