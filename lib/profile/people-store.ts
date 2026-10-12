import { pool } from "@/lib/db";
import { personKey, type Person } from "./people";

// Kontaktpersonerna i databasen (migrationen 0017). Allt här tål att tabellerna saknas: ett fel loggas, och profilen
// byggs ändå. En person som en admin tagit bort (people_suppressed) läggs inte tillbaka.

/** Namnnycklar för personer som tagits bort från företaget. Tom när tabellen saknas. */
export async function loadSuppressed(companyId: string): Promise<Set<string>> {
  try {
    const { rows } = await pool.query(`select name_key from people_suppressed where company_id = $1`, [companyId]);
    return new Set(rows.map((r) => r.name_key as string));
  } catch {
    return new Set();
  }
}

/** Vilka porträtt som redan är sparade för företaget, per namnnyckel: bildadressen och sökvägen. Tom när tabellen saknas. */
export async function loadPhotoCache(companyId: string): Promise<Map<string, { src: string | null; path: string | null }>> {
  try {
    const { rows } = await pool.query(`select name_key, photo_src, photo_path from company_people where company_id = $1 and photo_path is not null`, [companyId]);
    return new Map(rows.map((r) => [r.name_key as string, { src: (r.photo_src as string | null) ?? null, path: r.photo_path as string }]));
  } catch {
    return new Map();
  }
}

/** Sparar personerna på företaget. En person som inte längre finns på sidan tas bort, en som finns fylls på. */
export async function savePeople(companyId: string, people: readonly Person[]): Promise<void> {
  try {
    const keys = people.map((p) => personKey(p.name));
    await pool.query(`delete from company_people where company_id = $1 and not (name_key = any($2::text[]))`, [companyId, keys]);
    if (people.length === 0) return;
    await pool.query(
      `insert into company_people (company_id, name, name_key, role, email, phone, photo_src, photo_path, source_url, confidence, first_seen_at, last_seen_at)
       select $1, x.name, x.name_key, x.role, x.email, x.phone, x.photo_src, x.photo_path, x.source_url, x.confidence, now(), now()
       from jsonb_to_recordset($2::jsonb) as x(name text, name_key text, role text, email text, phone text, photo_src text, photo_path text, source_url text, confidence text)
       on conflict (company_id, name_key) do update set name = excluded.name, role = excluded.role, email = excluded.email, phone = excluded.phone,
         photo_src = excluded.photo_src, photo_path = coalesce(excluded.photo_path, company_people.photo_path), source_url = excluded.source_url, confidence = excluded.confidence, last_seen_at = now()`,
      [companyId, JSON.stringify(people.map((p) => ({ name: p.name, name_key: personKey(p.name), role: p.role, email: p.email, phone: p.phone, photo_src: p.photoUrl, photo_path: p.photoPath ?? null, source_url: p.sourceUrl, confidence: p.confidence })))],
    );
  } catch (e) {
    console.error("[personer] kunde inte spara:", e instanceof Error ? e.message : e);
  }
}

/** Tar bort en person för gott: raden försvinner och namnet läggs i listan över borttagna. */
export async function suppressPerson(companyId: string, key: string): Promise<void> {
  await pool.query(`insert into people_suppressed (company_id, name_key) values ($1, $2) on conflict do nothing`, [companyId, key]);
  await pool.query(`delete from company_people where company_id = $1 and name_key = $2`, [companyId, key]);
}

/** Tar bort personen ur den sparade profilens kontaktlista, så att den inte visas kvar tills profilen byggs om. */
export async function removePersonFromProfile(profileId: string, key: string): Promise<void> {
  const { rows } = await pool.query(`select profile from company_profiles where id = $1`, [profileId]);
  const profile = rows[0]?.profile as { contact?: { people?: Person[] } } | null;
  if (!profile?.contact?.people) return;
  profile.contact.people = profile.contact.people.filter((p) => personKey(p.name) !== key);
  await pool.query(`update company_profiles set profile = $2::jsonb where id = $1`, [profileId, JSON.stringify(profile)]);
}
