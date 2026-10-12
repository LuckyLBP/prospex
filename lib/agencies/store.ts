import { pool } from "@/lib/db";
import { agencyKey } from "@/lib/profile/creator";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { slugify } from "@/lib/slug";

// Byrån som källa i katalogen. En byrå är en leverantör (kind = 'supplier') med metoden 'agency', och dess kunder är
// företagen som har den som signal. Källan skapas opublicerad: ingen kund ser den förrän en admin granskat kunderna.

export class AgencyError extends Error {}

export interface AgencySource {
  id: string;
  slug: string;
  name: string;
  domain: string;
  created: boolean;
}

/** Skapar byråns källa, eller ger den som redan finns för domänen. Ett lås per domän, så att två profiler som hittar samma byrå samtidigt inte skapar två. */
export async function ensureAgencySupplier(i: { name: string; domain: string; logoPath?: string | null }): Promise<AgencySource> {
  const domain = normalizeDomain(i.domain);
  const name = i.name.trim().replace(/\s+/g, " ");
  if (!domain) throw new AgencyError("Byråns domän är ogiltig.");
  if (name.length < 2) throw new AgencyError("Byråns namn saknas.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`agency:${domain}`]);
    const existing = (await client.query(`select id, slug, name from suppliers where domain = $1 limit 1`, [domain])).rows[0];
    if (existing) {
      await client.query("commit");
      return { id: existing.id, slug: existing.slug, name: existing.name, domain, created: false };
    }

    // Samma kärnnamn hos en annan byrå ger en adress med domänen, så att inget krockar.
    const base = slugify(agencyKey(name));
    const taken = base.length < 2 || (await client.query(`select 1 from suppliers where slug = $1`, [base])).rowCount! > 0;
    const slug = taken ? slugify(domain) : base;
    const config = { agencyName: name, domain, maxCandidates: 1000, useViewdns: true, useClaude: true };
    const row = (await client.query(
      `insert into suppliers (id, slug, name, description, kind, category_id, published, sort, method, config, enrich_sites, logo_path, domain)
       values (gen_random_uuid(), $1, $2, $3, 'supplier', null, false, 0, 'agency', $4::jsonb, true, $5, $6)
       returning id, slug, name`,
      [slug, name, `Byrå. Kunder som visar ${name} i sidfoten.`, JSON.stringify(config), i.logoPath ?? null, domain],
    )).rows[0];
    await client.query("commit");
    return { id: row.id, slug: row.slug, name: row.name, domain, created: true };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Domäner som någon tagit bort från byrån. */
export async function rejectedDomains(supplierId: string): Promise<Set<string>> {
  const { rows } = await pool.query(`select domain from supplier_rejections where supplier_id = $1`, [supplierId]);
  return new Set(rows.map((r) => r.domain as string));
}

export interface AgencyCustomer {
  companyId: string;
  name: string | null;
  domain: string | null;
  sourceUrl: string | null;
  confidence: string | null;
  evidence: string | null;
  via: string | null;
  firstSeen: string;
}

export async function listAgencyCustomers(supplierId: string): Promise<AgencyCustomer[]> {
  const { rows } = await pool.query(
    `select c.id, c.name, c.domain, cs.source_url, cs.raw, cs.first_seen_at
     from company_signals cs join companies c on c.id = cs.company_id
     where cs.supplier_id = $1 order by cs.first_seen_at desc, c.name nulls last limit 1000`,
    [supplierId],
  );
  return rows.map((r) => {
    const raw = (r.raw ?? {}) as { confidence?: string; evidence?: string; via?: string };
    return { companyId: r.id, name: r.name, domain: r.domain, sourceUrl: r.source_url, confidence: raw.confidence ?? null, evidence: raw.evidence ?? null, via: raw.via ?? null, firstSeen: r.first_seen_at };
  });
}

/** Tar bort en kund från byrån och minns det, så att nästa körning inte lägger tillbaka den. Företaget i katalogen lämnas kvar. */
export async function removeAgencyCustomer(supplierId: string, companyId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const company = (await client.query(`select domain from companies where id = $1`, [companyId])).rows[0];
    const removed = await client.query(`delete from company_signals where supplier_id = $1 and company_id = $2`, [supplierId, companyId]);
    if (company?.domain) await client.query(`insert into supplier_rejections (supplier_id, domain) values ($1, $2) on conflict do nothing`, [supplierId, company.domain]);
    await client.query("commit");
    return (removed.rowCount ?? 0) > 0;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Byråns källa för en domän, om det finns en. Används för att se om en profil är en byrås. */
export async function getAgencyByDomain(domain: string | null): Promise<{ id: string; slug: string; name: string; published: boolean } | null> {
  if (!domain) return null;
  const { rows } = await pool.query(`select id, slug, name, published from suppliers where domain = $1 and method = 'agency' limit 1`, [domain]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------- minne över kontroller och förlorade kunder
// Tabellerna kommer med migrationen 0016. Utan dem fungerar allt som förut, men en stor byrå fylls inte på över flera
// körningar och en kund som slutat visa byrån tas inte bort.

export interface CheckedRow {
  verdict: string;
  misses: number;
  checkedAt: Date;
}

/** Vad vi vet om redan kontrollerade domäner för byrån. Tom när tabellen saknas. */
export async function loadChecked(supplierId: string): Promise<Map<string, CheckedRow>> {
  try {
    const { rows } = await pool.query(`select domain, verdict, misses, checked_at from supplier_checked where supplier_id = $1`, [supplierId]);
    return new Map(rows.map((r) => [r.domain as string, { verdict: r.verdict as string, misses: r.misses as number, checkedAt: new Date(r.checked_at) }]));
  } catch {
    return new Map();
  }
}

export async function recordChecked(supplierId: string, rows: { domain: string; verdict: string; misses: number }[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await pool.query(
      `insert into supplier_checked (supplier_id, domain, verdict, misses, checked_at)
       select $1, x.domain, x.verdict, x.misses, now() from jsonb_to_recordset($2::jsonb) as x(domain text, verdict text, misses int)
       on conflict (supplier_id, domain) do update set verdict = excluded.verdict, misses = excluded.misses, checked_at = now()`,
      [supplierId, JSON.stringify(rows)],
    );
  } catch (e) {
    console.error("[byrå] kunde inte spara kontrollerna:", e instanceof Error ? e.message : e);
  }
}

/** Domänerna på byråns nuvarande kunder, för att kontrollera att de fortfarande visar byrån. */
export async function existingCustomerDomains(supplierId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `select c.domain from company_signals cs join companies c on c.id = cs.company_id where cs.supplier_id = $1 and c.domain is not null`,
    [supplierId],
  );
  return rows.map((r) => r.domain as string);
}

/**
 * En kund som slutat visa byrån tas bort från den och noteras som tappad, eller som bytt byrå (`toName`). Företaget
 * i katalogen lämnas kvar. Görs bara om händelsen kan sparas, så att ingenting försvinner utan spår.
 */
export async function markCustomerLost(supplierId: string, domain: string, kind: "lost" | "switched", toName: string | null): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const company = (await client.query(`select id from companies where domain = $1 limit 1`, [domain])).rows[0];
    await client.query(`insert into supplier_customer_events (supplier_id, company_id, domain, kind, to_name) values ($1, $2, $3, $4, $5)`, [supplierId, company?.id ?? null, domain, kind, toName]);
    if (company) await client.query(`delete from company_signals where supplier_id = $1 and company_id = $2`, [supplierId, company.id]);
    await client.query("commit");
    return true;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error("[byrå] kunde inte notera en förlorad kund:", e instanceof Error ? e.message : e);
    return false;
  } finally {
    client.release();
  }
}

export interface CustomerEvent {
  domain: string;
  kind: "lost" | "switched";
  toName: string | null;
  at: string;
  companyName: string | null;
}

export async function listCustomerEvents(supplierId: string, limit = 200): Promise<CustomerEvent[]> {
  try {
    const { rows } = await pool.query(
      `select e.domain, e.kind, e.to_name, e.at, c.name from supplier_customer_events e left join companies c on c.id = e.company_id where e.supplier_id = $1 order by e.at desc limit $2`,
      [supplierId, limit],
    );
    return rows.map((r) => ({ domain: r.domain, kind: r.kind, toName: r.to_name, at: new Date(r.at).toISOString(), companyName: r.name }));
  } catch {
    return [];
  }
}

export interface CustomerFilter {
  page?: number;
  pageSize?: number;
  /** Bevisnivå, till exempel "backlink". */
  confidence?: string | null;
  q?: string | null;
}

/** En sida av byråns kunder, med filter på bevisnivå och sökning på namn eller domän. */
export async function listAgencyCustomersPage(supplierId: string, f: CustomerFilter = {}): Promise<{ rows: AgencyCustomer[]; total: number; byConfidence: Record<string, number> }> {
  const pageSize = Math.min(200, Math.max(10, f.pageSize ?? 100));
  const offset = (Math.max(1, f.page ?? 1) - 1) * pageSize;
  const q = f.q?.trim().toLowerCase() || null;
  const where = `cs.supplier_id = $1 and ($2::text is null or cs.raw->>'confidence' = $2) and ($3::text is null or lower(coalesce(c.name,'') || ' ' || coalesce(c.domain,'')) like '%' || $3 || '%')`;
  const [list, count, tiers] = await Promise.all([
    pool.query(
      `select c.id, c.name, c.domain, cs.source_url, cs.raw, cs.first_seen_at from company_signals cs join companies c on c.id = cs.company_id
       where ${where} order by cs.first_seen_at desc, c.name nulls last limit $4 offset $5`,
      [supplierId, f.confidence ?? null, q, pageSize, offset],
    ),
    pool.query(`select count(*)::int n from company_signals cs join companies c on c.id = cs.company_id where ${where}`, [supplierId, f.confidence ?? null, q]),
    pool.query(`select coalesce(cs.raw->>'confidence', 'okänd') c, count(*)::int n from company_signals cs where cs.supplier_id = $1 group by 1`, [supplierId]),
  ]);
  const rows = list.rows.map((r) => {
    const raw = (r.raw ?? {}) as { confidence?: string; evidence?: string; via?: string };
    return { companyId: r.id, name: r.name, domain: r.domain, sourceUrl: r.source_url, confidence: raw.confidence ?? null, evidence: raw.evidence ?? null, via: raw.via ?? null, firstSeen: r.first_seen_at } as AgencyCustomer;
  });
  return { rows, total: count.rows[0].n as number, byConfidence: Object.fromEntries(tiers.rows.map((r) => [r.c as string, r.n as number])) };
}

/** Tar bort alla kunder med en viss bevisnivå och minns domänerna, så att nästa körning inte lägger tillbaka dem. */
export async function removeAgencyCustomersByConfidence(supplierId: string, confidence: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into supplier_rejections (supplier_id, domain)
       select cs.supplier_id, c.domain from company_signals cs join companies c on c.id = cs.company_id
       where cs.supplier_id = $1 and cs.raw->>'confidence' = $2 and c.domain is not null on conflict do nothing`,
      [supplierId, confidence],
    );
    const r = await client.query(`delete from company_signals where supplier_id = $1 and raw->>'confidence' = $2`, [supplierId, confidence]);
    await client.query("commit");
    return r.rowCount ?? 0;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
