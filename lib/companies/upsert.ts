import { pool } from "@/lib/db";

// Lägger in ett enskilt företag i den gemensamma katalogen, utan att röra någon källas signaler. Samma regel som
// `upsertItems` (lib/runs/store.ts): ett känt värde töms eller skrivs aldrig över, och det som saknas fylls på.

export interface CompanyInput {
  dedupeKey: string;
  domain: string | null;
  name: string | null;
  phone?: string | null;
  email?: string | null;
  /** Aldrig ett personnummer. Anroparen ser till att en enskild firmas nummer inte skickas hit. */
  orgnr?: string | null;
  website?: string | null;
}

export interface UpsertedCompany {
  id: string;
  /** Företaget hade redan ett annat org.nr än det vi försökte lägga in. Det gamla behålls. */
  orgnrConflict: boolean;
}

export async function upsertCompany(c: CompanyInput): Promise<UpsertedCompany> {
  const { rows } = await pool.query(
    `insert into companies (dedupe_key, domain, name, phone, email, orgnr, website, first_seen_at, last_seen_at)
     values ($1,$2,$3,$4,$5,$6,$7, now(), now())
     on conflict (dedupe_key) do update set
       domain = coalesce(companies.domain, excluded.domain), name = coalesce(companies.name, excluded.name),
       phone = coalesce(companies.phone, excluded.phone), email = coalesce(companies.email, excluded.email),
       orgnr = coalesce(companies.orgnr, excluded.orgnr), website = coalesce(companies.website, excluded.website),
       last_seen_at = now()
     returning id, orgnr`,
    [c.dedupeKey, c.domain, c.name, c.phone ?? null, c.email ?? null, c.orgnr ?? null, c.website ?? null],
  );
  const stored = rows[0].orgnr as string | null;
  return { id: rows[0].id as string, orgnrConflict: !!c.orgnr && !!stored && stored !== c.orgnr };
}

export interface CatalogCompany {
  id: string;
  name: string | null;
  orgnr: string | null;
  domain: string | null;
  website: string | null;
  registry: unknown;
  dedupe_key: string;
}

const COLS = `id, name, orgnr, domain, website, registry, dedupe_key`;

/** Ett företag på org.nr. Finns flera väljs det som har en webbplats, och därefter det äldsta. */
export async function findCompanyByOrgnr(orgnr: string): Promise<CatalogCompany | null> {
  const { rows } = await pool.query(`select ${COLS} from companies where orgnr = $1 order by (domain is null), first_seen_at limit 1`, [orgnr]);
  return (rows[0] as CatalogCompany | undefined) ?? null;
}

export async function findCompanyByDomain(domain: string): Promise<CatalogCompany | null> {
  const { rows } = await pool.query(`select ${COLS} from companies where domain = $1 order by first_seen_at limit 1`, [domain]);
  return (rows[0] as CatalogCompany | undefined) ?? null;
}
