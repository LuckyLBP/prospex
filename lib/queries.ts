import { pool } from "./db";
import { buildSearchNeedle } from "./records/search";

/** Katalogfilter. Med `orgId` läggs bolagets egen status (utfall, arkiv) på raderna. */
export type Filters = {
  supplier?: string;
  city?: string;
  phoneOnly?: boolean;
  q?: string;
  orgId?: string;
  /** "active" (standard): dölj arkiverade. "archived": bara arkiverade. "all": båda. */
  archive?: "active" | "archived" | "all";
};

export type CompanyRow = {
  id: string;
  name: string | null;
  orgnr: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  supplier: string;
  supplier_logo: string | null;
  source_url: string | null;
  outcome: string | null;
  archived_at: Date | null;
};

export async function getStats() {
  const { rows } = await pool.query(`
    select
      (select count(*) from companies)::int                          as companies,
      (select count(*) from company_signals cs join suppliers s on s.id = cs.supplier_id where s.published)::int as signals,
      (select count(*) from suppliers where published and kind = 'supplier')::int as suppliers,
      (select count(*) from suppliers where published and kind = 'list')::int as lists,
      (select count(phone) from companies)::int                      as phone,
      (select count(email) from companies)::int                      as email,
      (select count(orgnr) from companies)::int                      as orgnr,
      (select count(website) from companies)::int                    as website,
      (select max(last_seen_at) from company_signals)                as last_seen
  `);
  return rows[0] as {
    companies: number; signals: number; suppliers: number; lists: number;
    phone: number; email: number; orgnr: number; website: number; last_seen: Date | null;
  };
}

export type SourceKind = "supplier" | "list";

/** Publicerade leverantörer (riktiga leverantörer, inte listor), för bolagen. */
export async function getSuppliers(kind: SourceKind = "supplier") {
  const { rows } = await pool.query(
    `
    select s.slug, s.name, s.logo_path as logo, count(cs.id)::int as n, count(c.phone)::int as with_phone
    from suppliers s
    left join company_signals cs on cs.supplier_id = s.id
    left join companies c on c.id = cs.company_id
    where s.published and s.kind = $1
    group by s.slug, s.name, s.logo_path
    order by n desc, s.name
  `,
    [kind],
  );
  return rows as { slug: string; name: string; logo: string | null; n: number; with_phone: number }[];
}

export type ListSummary = { slug: string; name: string; description: string | null; logo: string | null; n: number; with_phone: number };
export type ListCategory = { slug: string; name: string; description: string | null; icon: string | null; names_brand: boolean; lists: ListSummary[] };

/** Publicerade listor med minst ett företag, grupperade per kategori. Tomma listor och kategorier syns inte för kunderna. */
export async function getLists(): Promise<ListCategory[]> {
  const { rows } = await pool.query(`
    select k.slug as category_slug, k.name as category_name, k.description as category_description, k.icon, k.names_brand, k.sort as category_sort,
           s.slug, s.name, s.description, s.logo_path as logo, s.sort,
           count(cs.id)::int as n, count(c.phone)::int as with_phone
    from list_categories k
    join suppliers s on s.category_id = k.id and s.kind = 'list' and s.published
    left join company_signals cs on cs.supplier_id = s.id
    left join companies c on c.id = cs.company_id
    group by k.id, s.id
    having count(cs.id) > 0
    order by k.sort, k.name, s.sort, n desc, s.name
  `);
  const map = new Map<string, ListCategory>();
  for (const r of rows) {
    const cat: ListCategory = map.get(r.category_slug) ?? { slug: r.category_slug, name: r.category_name, description: r.category_description, icon: r.icon, names_brand: r.names_brand, lists: [] };
    cat.lists.push({ slug: r.slug, name: r.name, description: r.description, logo: r.logo, n: r.n, with_phone: r.with_phone });
    map.set(r.category_slug, cat);
  }
  return [...map.values()];
}

export type Source = { slug: string; name: string; logo: string | null; kind: SourceKind; description: string | null; category: { slug: string; name: string; icon: string | null; names_brand: boolean } | null };

/** En publicerad källa (leverantör eller lista) med sin kategori. */
export async function getSource(slug: string): Promise<Source | null> {
  const { rows } = await pool.query(
    `select s.slug, s.name, s.logo_path as logo, s.kind, s.description,
            k.slug as cat_slug, k.name as cat_name, k.icon as cat_icon, k.names_brand as cat_brand
     from suppliers s left join list_categories k on k.id = s.category_id
     where s.slug = $1 and s.published`,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    slug: r.slug, name: r.name, logo: r.logo, kind: r.kind, description: r.description,
    category: r.cat_slug ? { slug: r.cat_slug, name: r.cat_name, icon: r.cat_icon, names_brand: r.cat_brand } : null,
  };
}

/** Alla publicerade källor, för filter: leverantörer först, sedan listor per kategori. */
export async function getSources() {
  const { rows } = await pool.query(`
    select s.slug, s.name, s.logo_path as logo, s.kind, k.name as category, k.icon as icon, k.sort as category_sort,
           (select count(*) from company_signals cs where cs.supplier_id = s.id)::int as n
    from suppliers s left join list_categories k on k.id = s.category_id
    where s.published
    order by (s.kind = 'supplier') desc, k.sort nulls first, k.name nulls first, n desc, s.name
  `);
  return rows as { slug: string; name: string; logo: string | null; kind: SourceKind; category: string | null; icon: string | null; n: number }[];
}

function where(f: Filters) {
  const cond: string[] = [];
  const args: unknown[] = [];
  if (f.supplier) { args.push(f.supplier); cond.push(`s.slug = $${args.length}`); }
  if (f.city) { args.push(`%${f.city}%`); cond.push(`c.registry->'organisation'->'address'->>'city' ilike $${args.length}`); }
  if (f.phoneOnly) cond.push(`c.phone is not null`);
  const needle = f.q ? buildSearchNeedle(f.q) : null;
  if (needle) { args.push(needle); cond.push(`c.search_text like $${args.length}`); }
  if (f.orgId) {
    const mode = f.archive ?? "active";
    if (mode === "active") cond.push(`k.archived_at is null`);
    else if (mode === "archived") cond.push(`k.archived_at is not null`);
  }
  return { sql: cond.length ? `where ${cond.join(" and ")}` : "", args };
}

function from(f: Filters, args: unknown[]) {
  let sql = `
    from company_signals cs
    join companies c on c.id = cs.company_id
    join suppliers s on s.id = cs.supplier_id and s.published`;
  if (f.orgId) {
    args.push(f.orgId);
    sql += ` left join contacts k on k.company_id = c.id and k.org_id = $${args.length}`;
  }
  return sql;
}

export async function countCompanies(f: Filters) {
  const w = where(f);
  const args = [...w.args];
  const fr = from(f, args);
  const { rows } = await pool.query(`select count(*)::int n ${fr} ${w.sql}`, args);
  return rows[0].n as number;
}

export async function searchCompanies(f: Filters, limit: number, offset = 0) {
  const w = where(f);
  const args = [...w.args];
  const fr = from(f, args);
  const { rows } = await pool.query(
    `select c.id, c.name, c.orgnr, c.phone, c.email, c.website,
            c.registry->'organisation'->'address'->>'city' as city,
            s.name as supplier, s.logo_path as supplier_logo, cs.source_url,
            ${f.orgId ? "k.outcome, k.archived_at" : "null::text as outcome, null::timestamptz as archived_at"}
     ${fr} ${w.sql}
     order by c.name nulls last, c.id
     limit ${Math.floor(limit)} offset ${Math.floor(offset)}`,
    args,
  );
  return rows as CompanyRow[];
}

export async function getSupplier(slug: string) {
  const src = await getSource(slug);
  return src ? { name: src.name, logo: src.logo } : null;
}

export async function getSupplierName(slug: string) {
  return (await getSource(slug))?.name ?? null;
}

/** Global sök (⌘K): matchar på namn, org.nr, domän, e-post och telefon, men svaret har aldrig telefon eller org.nr. Numren visas bara på företagets egen sida, där gränserna gäller. */
export async function globalSearch(q: string, limit = 8) {
  const needle = buildSearchNeedle(q);
  if (!needle) return [];
  const { rows } = await pool.query(
    `select c.id, c.name, c.registry->'organisation'->'address'->>'city' as city,
            (select string_agg(s.name, ', ' order by s.name) from company_signals cs
               join suppliers s on s.id = cs.supplier_id and s.published where cs.company_id = c.id) as suppliers
     from companies c
     where c.search_text like $1
     order by c.name nulls last
     limit $2`,
    [needle, limit],
  );
  return rows as { id: string; name: string | null; city: string | null; suppliers: string | null }[];
}
