import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AVATAR_SIZE, cleanName, makeAvatar, NAME_MAX, parsePrefs } from "./account";

async function jpeg(w: number, h: number): Promise<Uint8Array> {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + (i >> 4)) & 255;
  return new Uint8Array(await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer());
}

describe("cleanName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanName("  Lucas   Pohlare ")).toEqual({ ok: true, name: "Lucas Pohlare" });
  });
  it("refuses empty, too long, and names with links or markup", () => {
    expect(cleanName("   ")).toMatchObject({ ok: false });
    expect(cleanName("x".repeat(NAME_MAX + 1))).toMatchObject({ ok: false });
    expect(cleanName("Ring https://x.se")).toMatchObject({ ok: false });
    expect(cleanName("<b>Anna</b>")).toMatchObject({ ok: false });
    expect(cleanName("x".repeat(NAME_MAX))).toMatchObject({ ok: true });
  });
});

describe("makeAvatar", () => {
  it("makes a small square WebP from a photo", async () => {
    const out = await makeAvatar(await jpeg(800, 600));
    expect(out).not.toBeNull();
    expect(await sharp(out!).metadata()).toMatchObject({ format: "webp", width: AVATAR_SIZE, height: AVATAR_SIZE });
    expect(out!.byteLength).toBeLessThan(40_000);
  });
  it("refuses something that is not an image, an icon-sized image, and an empty file", async () => {
    expect(await makeAvatar(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(await makeAvatar(await jpeg(30, 30))).toBeNull();
    expect(await makeAvatar(new Uint8Array())).toBeNull();
  });
});

describe("parsePrefs", () => {
  it("accepts valid values and checkbox states", () => {
    expect(parsePrefs({ order: "ort", template: "noanswer", callbackEmail: "on" })).toEqual({ order: "ort", template: "noanswer", callbackEmail: true });
  });
  it("falls back to the defaults for anything else", () => {
    expect(parsePrefs({ order: "hack", template: "x", callbackEmail: null })).toEqual({ order: "slump", template: null, callbackEmail: false });
    expect(parsePrefs({})).toEqual({ order: "slump", template: null, callbackEmail: false });
  });
});
