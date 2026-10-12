
const BUCKET = "supplier-logos";
const MAX_BYTES = 1_000_000;

export function imageKind(b: Uint8Array): { ext: string; mime: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: "gif", mime: "image/gif" };
  return null;
}

export class UploadError extends Error {}

/** Laddar upp en logotyp till den publika bucketen. Typen avgörs av filens innehåll, inte dess namn eller deklarerade typ. */
export async function uploadLogo(slug: string, file: File): Promise<string> {
  if (file.size === 0) throw new UploadError("Filen är tom.");
  if (file.size > MAX_BYTES) throw new UploadError("Logotypen får vara högst 1 MB.");
  return uploadLogoBytes(slug, new Uint8Array(await file.arrayBuffer()));
}

/** Samma upplagring för bytes som hämtats av koden (en webbplats logotyp). Namnet får inte innehålla snedstreck. */
export async function uploadLogoBytes(name: string, bytes: Uint8Array): Promise<string> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new UploadError("Lagringen är inte konfigurerad.");
  if (bytes.byteLength === 0) throw new UploadError("Filen är tom.");
  if (bytes.byteLength > MAX_BYTES) throw new UploadError("Logotypen får vara högst 1 MB.");
  const k = imageKind(bytes);
  if (!k) throw new UploadError("Logotypen måste vara en PNG-, JPG-, WebP- eller GIF-bild.");
  const path = `${name.replace(/[^a-z0-9._-]+/gi, "-")}-${Date.now()}.${k.ext}`;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": k.mime },
    body: bytes as BodyInit,
  });
  if (!res.ok) throw new UploadError("Kunde inte ladda upp logotypen.");
  return path;
}

/** Tar bort en gammal logotyp. Misslyckas det är det inget fel: filen är bara onödig. */
export async function deleteLogo(path: string | null | undefined): Promise<void> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || !path || path.includes("/")) return;
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).catch(() => {});
}
