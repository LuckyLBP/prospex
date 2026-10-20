import { invalidateCatalogue } from "./catalogue-tag";
import { pool } from "./db";
import { slugify } from "./slug";
import type { Method } from "./sources/collection";

// Plattformsadmin: kategorier, listor och leverantörers metadata, inklusive insamlingsmetod och inställningar.

export class ListError extends Error {}
const ICONS = ["Briefcase", "Layers", "LibraryBig"] as const;
export const ICON_NAMES = ICONS;

export async function listCategories() {
  const { rows } = await pool.query(
    `select k.id, k.slug, k.name, k.description, k.icon, k.names_brand, k.sort,
            (select count(*)::int from suppliers s where s.category_id = k.id) as lists
     from list_categories k order by k.sort, k.name`,
  );
  return rows as { id: string; slug: string; name: string; description: string | null; icon: string | null; names_brand: boolean; sort: number; lists: number }[];
}

export type AdminSource = {
  id: string; slug: string; name: string; description: string | null; kind: "supplier" | "list"; category_id: string | null; category_name: string | null;
  published: boolean; logo_path: string | null; method: string | null; config: unknown; enrich_sites: boolean; sort: number; companies: number; last_seen: string | null;
};

const SOURCE_SELECT = `
  select s.id, s.slug, s.name, s.description, s.kind, s.category_id, k.name as category_name, s.published, s.logo_path, s.method, s.config, s.enrich_sites, s.sort,
         count(cs.id)::int as companies, max(cs.last_seen_at) as last_seen
  from suppliers s left join list_categories k on k.id = s.category_id left join company_signals cs on cs.supplier_id = s.id`;

const toSource = (r: Record<string, unknown>): AdminSource => ({ ...(r as unknown as AdminSource), last_seen: r.last_seen ? new Date(r.last_seen as string).toISOString() : null });

/** Alla källor, även opublicerade. Företagsantal och senast hämtad räknas ur signalerna. */
export async function listSources(): Promise<AdminSource[]> {
  const { rows } = await pool.query(`${SOURCE_SELECT} group by s.id, k.name order by (s.kind = 'supplier'), s.sort, s.name`);
  return rows.map(toSource);
}

export async function getSourceAdmin(slug: string): Promise<AdminSource | null> {
  const { rows } = await pool.query(`${SOURCE_SELECT} where s.slug = $1 group by s.id, k.name`, [slug]);
  return rows[0] ? toSource(rows[0]) : null;
}

export async function getSourceById(id: string): Promise<AdminSource | null> {
  const { rows } = await pool.query(`${SOURCE_SELECT} where s.id = $1 group by s.id, k.name`, [id]);
  return rows[0] ? toSource(rows[0]) : null;
}

export async function getCategoryAdmin(slug: string) {
  const { rows } = await pool.query(
    `select k.id, k.slug, k.name, k.description, k.icon, k.names_brand, k.sort, (select count(*)::int from suppliers s where s.category_id = k.id) as lists
     from list_categories k where k.slug = $1`,
    [slug],
  );
  return (rows[0] as { id: string; slug: string; name: string; description: string | null; icon: string | null; names_brand: boolean; sort: number; lists: number } | undefined) ?? null;
}

const cleanName = (n: string) => {
  const v = n.trim().replace(/\s+/g, " ");
  if (v.length < 2 || v.length > 80) throw new ListError("Namnet måste vara mellan 2 och 80 tecken.");
  return v;
};

export async function createCategory(input: { name: string; description: string; icon: string; namesBrand: boolean; sort: number }): Promise<string> {
  const name = cleanName(input.name);
  const slug = slugify(name);
  if (slug.length < 2) throw new ListError("Namnet ger ingen giltig adress. Använd bokstäver eller siffror.");
  const icon = (ICONS as readonly string[]).includes(input.icon) ? input.icon : "LibraryBig";
  const r = await pool.query(
    `insert into list_categories (slug, name, description, icon, names_brand, sort) values ($1,$2,$3,$4,$5,$6) on conflict (slug) do nothing returning id`,
    [slug, name, input.description.trim() || null, icon, input.namesBrand, input.sort],
  );
  if (!r.rows[0]) throw new ListError("Det finns redan en kategori med det namnet.");
  invalidateCatalogue();
  return slug;
}

export async function updateCategory(id: string, input: { name: string; description: string; icon: string; namesBrand: boolean; sort: number }) {
  const icon = (ICONS as readonly string[]).includes(input.icon) ? input.icon : "LibraryBig";
  await pool.query(
    `update list_categories set name = $2, description = $3, icon = $4, names_brand = $5, sort = $6 where id = $1`,
    [id, cleanName(input.name), input.description.trim() || null, icon, input.namesBrand, input.sort],
  );
  invalidateCatalogue();
}

export async function deleteCategory(id: string) {
  const n = (await pool.query(`select count(*)::int n from suppliers where category_id = $1`, [id])).rows[0].n as number;
  if (n > 0) throw new ListError("Kategorin har listor. Flytta eller ta bort dem först.");
  await pool.query(`delete from list_categories where id = $1`, [id]);
  invalidateCatalogue();
}

export type SourceInput = {
  name: string;
  description: string;
  kind: "supplier" | "list";
  categoryId: string | null;
  published: boolean;
  sort: number;
  /** Insamling, redan validerad (lib/sources/collection.ts). Utan detta lämnas källans nuvarande insamling orörd. */
  collection?: { method: Method | null; config: Record<string, unknown>; enrichSites: boolean };
};

function normalise(i: SourceInput) {
  if (i.kind === "list" && !i.categoryId) throw new ListError("En lista måste ha en kategori.");
  return { name: cleanName(i.name), description: i.description.trim() || null, categoryId: i.kind === "list" ? i.categoryId : null };
}

export async function createList(i: SourceInput, logoPath: string | null = null): Promise<string> {
  const n = normalise({ ...i, kind: "list" });
  const slug = slugify(n.name);
  if (slug.length < 2) throw new ListError("Namnet ger ingen giltig adress. Använd bokstäver eller siffror.");
  const r = await pool.query(
    `insert into suppliers (id, slug, name, description, kind, category_id, published, sort, method, config, enrich_sites, logo_path)
     values (gen_random_uuid(), $1,$2,$3,'list',$4,$5,$6,$7,$8::jsonb,$9,$10)
     on conflict (slug) do nothing returning slug`,
    [slug, n.name, n.description, n.categoryId, i.published, i.sort, i.collection?.method ?? null, JSON.stringify(i.collection?.config ?? {}), i.collection?.enrichSites ?? true, logoPath],
  );
  if (!r.rows[0]) throw new ListError("Det finns redan en källa med det namnet.");
  invalidateCatalogue();
  return slug;
}

/** Adressen (slug) en lista med det här namnet får. Anropas före uppladdning, så att filen kan döpas efter den. */
export const listSlug = (name: string) => slugify(cleanName(name));

/** Uppdaterar en källa. Adressen (slug) ändras aldrig, så länkar och sparade filter fortsätter fungera. */
export async function updateSource(id: string, i: SourceInput) {
  const n = normalise(i);
  const c = i.collection;
  const r = await pool.query(
    `update suppliers set name = $2, description = $3, kind = $4, category_id = $5, published = $6, sort = $7,
            method = case when $8::boolean then $9 else method end,
            config = case when $8::boolean then $10::jsonb else config end,
            enrich_sites = case when $8::boolean then $11 else enrich_sites end,
            updated_at = now()
     where id = $1 returning slug`,
    [id, n.name, n.description, i.kind, n.categoryId, i.published, i.sort, !!c, c?.method ?? null, JSON.stringify(c?.config ?? {}), c?.enrichSites ?? true],
  );
  if (!r.rows[0]) throw new ListError("Källan finns inte.");
  invalidateCatalogue();
}

export async function setLogoPath(id: string, path: string | null): Promise<string | null> {
  const old = (await pool.query(`select logo_path from suppliers where id = $1`, [id])).rows[0]?.logo_path as string | null | undefined;
  await pool.query(`update suppliers set logo_path = $2, updated_at = now() where id = $1`, [id, path]);
  invalidateCatalogue();
  return old ?? null;
}

