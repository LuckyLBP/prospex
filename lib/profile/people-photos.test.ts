import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { Person } from "./people";
import { makeThumbnail, MAX_PHOTOS, MAX_THUMB_BYTES, photoPath, storePhotos, THUMB_SIZE, type PhotoDeps } from "./people-photos";

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  // Brus i stället för en slät färg, så att bilden liknar ett foto och inte komprimeras till nästan inget.
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + (i >> 3)) & 255;
  return new Uint8Array(await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer());
}

describe("makeThumbnail", () => {
  it("makes a small square WebP from a portrait photo", async () => {
    const out = await makeThumbnail(await jpeg(600, 800));
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta).toMatchObject({ format: "webp", width: THUMB_SIZE, height: THUMB_SIZE });
    expect(out!.byteLength).toBeLessThanOrEqual(MAX_THUMB_BYTES);
  });
  it("rejects an icon, a wide banner and something that is not an image", async () => {
    expect(await makeThumbnail(await jpeg(40, 40))).toBeNull();
    expect(await makeThumbnail(await jpeg(1600, 300))).toBeNull();
    expect(await makeThumbnail(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("storePhotos", () => {
  const person = (name: string, photoUrl: string | null): Person => ({ name, role: "Chef", email: null, phone: null, photoUrl, sourceUrl: "https://a.se/team", confidence: "medel" });

  async function deps(over: Partial<PhotoDeps> = {}) {
    const good = await jpeg(500, 500);
    const uploaded: string[] = [];
    const fetchBytes = vi.fn(async (url: string) => (url.includes("saknas") ? { ok: false, bytes: null, contentType: null, finalUrl: url, problem: "404" } : { ok: true, bytes: good, contentType: "image/jpeg", finalUrl: url, problem: null })) as unknown as PhotoDeps["fetchBytes"];
    return { fetchBytes, upload: async (p: string) => { uploaded.push(p); }, configured: () => true, uploaded, ...over } as PhotoDeps & { uploaded: string[]; fetchBytes: ReturnType<typeof vi.fn> };
  }

  it("downloads, shrinks and stores a photo under the company and a hash of the address", async () => {
    const d = await deps();
    const [p] = await storePhotos("c1", [person("Anna Berg", "https://a.se/anna.jpg")], new Map(), d);
    expect(p.photoPath).toBe(photoPath("c1", "https://a.se/anna.jpg"));
    expect(p.photoPath).toMatch(/^c1\/[0-9a-f]{20}\.webp$/);
    expect(d.uploaded).toEqual([p.photoPath]);
  });
  it("does not download a photo again from the same address", async () => {
    const d = await deps();
    const path = photoPath("c1", "https://a.se/anna.jpg");
    const [p] = await storePhotos("c1", [person("Anna Berg", "https://a.se/anna.jpg")], new Map([["anna berg", { src: "https://a.se/anna.jpg", path }]]), d);
    expect(p.photoPath).toBe(path);
    expect(d.fetchBytes).not.toHaveBeenCalled();
  });
  it("downloads again when the address has changed", async () => {
    const d = await deps();
    await storePhotos("c1", [person("Anna Berg", "https://a.se/ny.jpg")], new Map([["anna berg", { src: "https://a.se/gammal.jpg", path: "c1/x.webp" }]]), d);
    expect(d.fetchBytes).toHaveBeenCalledTimes(1);
  });
  it("leaves a person without a photo, but keeps the person, when the image cannot be fetched, is not a photo or fails to upload", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = await deps({ upload: async () => { throw new Error("lagringen nere"); } });
    const out = await storePhotos("c1", [person("Anna Berg", "https://a.se/saknas.jpg"), person("Bo Ek", "https://a.se/bo.jpg"), person("Cia Lund", null)], new Map(), d);
    expect(out.map((p) => [p.name, p.photoPath])).toEqual([["Anna Berg", null], ["Bo Ek", null], ["Cia Lund", null]]);
    quiet.mockRestore();
  });
  it("does nothing when storage is not configured, and stores at most ten photos", async () => {
    const off = await deps({ configured: () => false });
    expect((await storePhotos("c1", [person("Anna Berg", "https://a.se/a.jpg")], new Map(), off))[0].photoPath).toBeNull();
    expect(off.fetchBytes).not.toHaveBeenCalled();
    const d = await deps();
    const many = Array.from({ length: 13 }, (_, i) => person(`Person Nr${String.fromCharCode(65 + i)}`, `https://a.se/${i}.jpg`));
    const out = await storePhotos("c1", many, new Map(), d);
    expect(out).toHaveLength(13);
    expect(d.uploaded).toHaveLength(MAX_PHOTOS);
    expect(out.slice(MAX_PHOTOS).every((p) => p.photoPath === null)).toBe(true);
  });
});
