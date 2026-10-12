import { createHash } from "node:crypto";
import sharp from "sharp";
import { mapWithConcurrency } from "@/lib/concurrency";
import { imageKind } from "@/lib/storage";
import { isPeopleStorageConfigured, uploadPersonPhoto } from "@/lib/storage-people";
import { personKey, type Person } from "./people";
import { safeFetchBytes } from "./safe-fetch";

// Porträtt av kontaktpersoner: hämta bilden en gång, förminska till 160×160 WebP (cirka 8 till 15 kB), spara i den
// privata bucketen. Högst tio personer per företag, och en bild hämtas inte om adressen är densamma som sist. Ett fel på
// en bild lämnar personen utan bild, aldrig utan person.

export const MAX_PHOTOS = 10;
export const THUMB_SIZE = 160;
/** Så stor får en nedladdad bild vara innan den förminskas. */
export const MAX_DOWNLOAD = 2_000_000;
/** Så stor får den förminskade bilden vara. */
export const MAX_THUMB_BYTES = 40_000;
/** Kortaste sidan i originalet: mindre bilder är ikoner, inte porträtt. */
export const MIN_SIDE = 80;

/** Förminskar ett porträtt. Null för något som inte ser ut som ett porträtt (för litet, ett brett banner) eller inte går att läsa. */
export async function makeThumbnail(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const meta = await sharp(bytes).metadata();
    const { width, height } = meta;
    if (!width || !height || Math.min(width, height) < MIN_SIDE) return null;
    const ratio = width / height;
    if (ratio < 0.5 || ratio > 1.8) return null;
    for (const quality of [72, 55, 40]) {
      const out = await sharp(bytes).rotate().resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "attention" }).webp({ quality }).toBuffer();
      if (out.byteLength <= MAX_THUMB_BYTES) return new Uint8Array(out);
    }
    return null;
  } catch {
    return null;
  }
}

export interface PhotoCacheEntry {
  src: string | null;
  path: string | null;
}

export interface PhotoDeps {
  fetchBytes: typeof safeFetchBytes;
  upload: (path: string, bytes: Uint8Array) => Promise<void>;
  configured: () => boolean;
}
export const defaultPhotoDeps: PhotoDeps = { fetchBytes: safeFetchBytes, upload: uploadPersonPhoto, configured: isPeopleStorageConfigured };

/** Sökvägen i bucketen: företag och en hash av bildadressen, så att samma adress ger samma fil. */
export const photoPath = (companyId: string, src: string): string => `${companyId}/${createHash("sha1").update(src).digest("hex").slice(0, 20)}.webp`;

/**
 * Hämtar och sparar porträtt för personerna och ger tillbaka dem med `photoPath`. Bilder som redan sparats från samma
 * adress (`cache`, per namnnyckel) hämtas inte igen.
 */
export async function storePhotos(companyId: string, people: readonly Person[], cache: ReadonlyMap<string, PhotoCacheEntry>, deps: PhotoDeps = defaultPhotoDeps): Promise<Person[]> {
  if (!deps.configured()) return people.map((p) => ({ ...p, photoPath: null }));
  return mapWithConcurrency(people.slice(0, MAX_PHOTOS), 4, async (p): Promise<Person> => {
    if (!p.photoUrl) return { ...p, photoPath: null };
    const known = cache.get(personKey(p.name));
    if (known?.path && known.src === p.photoUrl) return { ...p, photoPath: known.path };
    try {
      const got = await deps.fetchBytes(p.photoUrl, { maxBytes: MAX_DOWNLOAD });
      if (!got.ok || !got.bytes || !imageKind(got.bytes)) return { ...p, photoPath: null };
      const thumb = await makeThumbnail(got.bytes);
      if (!thumb) return { ...p, photoPath: null };
      const path = photoPath(companyId, p.photoUrl);
      await deps.upload(path, thumb);
      return { ...p, photoPath: path };
    } catch (e) {
      console.error("[personer] porträttet kunde inte sparas:", e instanceof Error ? e.message : e);
      return { ...p, photoPath: null };
    }
  }).then((done) => [...done, ...people.slice(MAX_PHOTOS).map((p) => ({ ...p, photoPath: null }))]);
}
