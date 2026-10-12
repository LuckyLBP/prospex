// Förminskade porträtt av kontaktpersoner. Bilderna är personuppgifter, så bucketen är PRIVAT: en bild visas bara via en
// kortlivad signerad länk som skapas när en inloggad admin eller användare tittar på sidan. Filerna ligger under
// <företags-id>/<hash av bildadressen>.webp, och ett hämtat porträtt är högst ett par tiotal kB.

const BUCKET = "people-photos";
const base = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1`;
const headers = (key: string, extra: Record<string, string> = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });

export const PHOTO_URL_TTL_S = 3600;
export const isPeopleStorageConfigured = (): boolean => !!process.env.SUPABASE_SECRET_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Skapar den privata bucketen om den saknas. Sant när den finns efteråt. */
export async function ensurePeopleBucket(): Promise<boolean> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return false;
  const res = await fetch(`${base()}/bucket`, {
    method: "POST",
    headers: headers(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 102_400, allowed_mime_types: ["image/webp"] }),
  });
  return res.ok || res.status === 409;
}

/** Laddar upp ett förminskat porträtt. Saknas bucketen skapas den och uppladdningen provas en gång till. */
export async function uploadPersonPhoto(path: string, bytes: Uint8Array): Promise<void> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Lagringen är inte konfigurerad.");
  const put = () => fetch(`${base()}/object/${BUCKET}/${path}`, { method: "POST", headers: headers(key, { "Content-Type": "image/webp", "x-upsert": "true" }), body: bytes as BodyInit });
  let res = await put();
  if (res.status === 404 || res.status === 400) {
    if (await ensurePeopleBucket()) res = await put();
  }
  if (!res.ok) throw new Error(`Kunde inte ladda upp porträttet (${res.status}).`);
}

/** Signerade länkar för en uppsättning sökvägar, giltiga en timme. Sökvägar utan länk saknas i svaret. */
export async function signPhotoUrls(paths: readonly string[]): Promise<Map<string, string>> {
  const key = process.env.SUPABASE_SECRET_KEY;
  const out = new Map<string, string>();
  if (!key || paths.length === 0) return out;
  try {
    const res = await fetch(`${base()}/object/sign/${BUCKET}`, {
      method: "POST",
      headers: headers(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: PHOTO_URL_TTL_S, paths }),
    });
    if (!res.ok) return out;
    const rows = (await res.json()) as { path?: string; signedURL?: string | null }[];
    for (const r of rows) if (r.path && r.signedURL) out.set(r.path, `${base()}${r.signedURL}`);
  } catch {
    /* utan länk visas initialer */
  }
  return out;
}

export async function deletePersonPhotos(paths: readonly string[]): Promise<void> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || paths.length === 0) return;
  await fetch(`${base()}/object/${BUCKET}`, { method: "DELETE", headers: headers(key, { "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: paths }) }).catch(() => {});
}
