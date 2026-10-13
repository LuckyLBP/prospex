// Profilbilder. Bucketen är PRIVAT: en bild visas bara via en kortlivad signerad länk som skapas när en inloggad
// medlem tittar på en sida där personen visas (menyn, teamet). Filerna är små (256 x 256 WebP, ett par kB).

const BUCKET = "avatars";
const base = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1`;
const headers = (key: string, extra: Record<string, string> = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });

export const AVATAR_URL_TTL_S = 3600;
export const isAvatarStorageConfigured = (): boolean => !!process.env.SUPABASE_SECRET_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

async function ensureBucket(): Promise<boolean> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return false;
  const res = await fetch(`${base()}/bucket`, {
    method: "POST",
    headers: headers(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 102_400, allowed_mime_types: ["image/webp"] }),
  });
  return res.ok || res.status === 409;
}

/** Laddar upp en profilbild. Saknas bucketen skapas den och uppladdningen provas en gång till. */
export async function uploadAvatar(path: string, bytes: Uint8Array): Promise<void> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Lagringen är inte konfigurerad.");
  const put = () => fetch(`${base()}/object/${BUCKET}/${path}`, { method: "POST", headers: headers(key, { "Content-Type": "image/webp", "x-upsert": "true" }), body: bytes as BodyInit });
  let res = await put();
  if (res.status === 404 || res.status === 400) { if (await ensureBucket()) res = await put(); }
  if (!res.ok) throw new Error(`Kunde inte ladda upp bilden (${res.status}).`);
}

// Länkarna gäller en timme och sidhuvudet visar bilden på varje sida, så de sparas i minnet en stund (per serverinstans).
const cache = new Map<string, { url: string; until: number }>();
const KEEP_MS = 50 * 60_000;

/** Signerade länkar, giltiga en timme. Sökvägar utan länk saknas i svaret. */
export async function signAvatarUrls(paths: readonly string[]): Promise<Map<string, string>> {
  const key = process.env.SUPABASE_SECRET_KEY;
  const out = new Map<string, string>();
  const now = Date.now();
  const unique = [...new Set(paths.filter(Boolean))];
  for (const p of unique) { const c = cache.get(p); if (c && c.until > now) out.set(p, c.url); }
  const wanted = unique.filter((p) => !out.has(p));
  if (!key || wanted.length === 0) return out;
  try {
    const res = await fetch(`${base()}/object/sign/${BUCKET}`, { method: "POST", headers: headers(key, { "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: AVATAR_URL_TTL_S, paths: wanted }) });
    if (!res.ok) return out;
    for (const r of (await res.json()) as { path?: string; signedURL?: string | null }[]) {
      if (!r.path || !r.signedURL) continue;
      const url = `${base()}${r.signedURL}`;
      out.set(r.path, url);
      cache.set(r.path, { url, until: now + KEEP_MS });
    }
  } catch {
    /* utan länk visas initialen */
  }
  return out;
}

export async function deleteAvatar(path: string | null | undefined): Promise<void> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || !path) return;
  await fetch(`${base()}/object/${BUCKET}`, { method: "DELETE", headers: headers(key, { "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: [path] }) }).catch(() => {});
}
