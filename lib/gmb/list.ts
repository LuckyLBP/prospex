import { pool } from "@/lib/db";

// Listan "Företag utan Google-profil": företagen där kontrollen (check.ts) säger "none". Byggs av tabellen gmb_checks och hålls i takt
// med den: ett företag som senare visar sig ha en profil tas bort ur listan. Den skapas opublicerad, så att en admin
// granskar den innan någon säljare ser den.

export const NO_PROFILE_LIST_SLUG = "utan-google-profil";

export async function ensureNoProfileList(): Promise<{ id: string; created: boolean }> {
  const existing = (await pool.query(`select id from suppliers where slug = $1`, [NO_PROFILE_LIST_SLUG])).rows[0];
  if (existing) return { id: existing.id as string, created: false };
  const cat = (await pool.query(`select id from list_categories where slug = 'bransch'`)).rows[0];
  const row = (await pool.query(
    `insert into suppliers (id, slug, name, description, kind, category_id, published, sort, method, config, enrich_sites)
     values (gen_random_uuid(), $1, 'Företag utan Google-profil', $2, 'list', $3, false, 0, null, '{}'::jsonb, false) returning id`,
    [
      NO_PROFILE_LIST_SLUG,
      "Företag med webbplats och telefonnummer där vi inte hittar någon Google-profil (Google Business Profile). Kontrollerat mot Googles sök och mot företagets egen webbplats. Ett fåtal kan ha en profil som vi inte hittar, så det är en trolig lista och inte en säker.",
      cat.id,
    ],
  )).rows[0];
  return { id: row.id as string, created: true };
}

/** Lägger in företagen som saknar profil och tar bort dem som inte längre gör det. Ger antalen. */
export async function syncNoProfileList(): Promise<{ added: number; removed: number; total: number }> {
  const { id } = await ensureNoProfileList();
  const added = (await pool.query(
    `insert into company_signals (company_id, supplier_id, source_url, first_seen_at, last_seen_at, raw)
     select g.company_id, $1, c.website, now(), now(),
            jsonb_build_object('via', 'gmb-check', 'confidence', 'troligen', 'evidence', 'Ingen Google-profil hittad', 'query', g.query, 'checked_at', g.checked_at)
     from gmb_checks g join companies c on c.id = g.company_id
     where g.state = 'none'
     on conflict (company_id, supplier_id) do update set last_seen_at = now(), raw = excluded.raw
     returning (xmax = 0) as inserted`,
    [id],
  )).rows.filter((r) => r.inserted).length;
  const removed = (await pool.query(
    `delete from company_signals cs where cs.supplier_id = $1 and not exists (select 1 from gmb_checks g where g.company_id = cs.company_id and g.state = 'none')`,
    [id],
  )).rowCount ?? 0;
  const total = (await pool.query(`select count(*)::int n from company_signals where supplier_id = $1`, [id])).rows[0].n as number;
  return { added, removed, total };
}
