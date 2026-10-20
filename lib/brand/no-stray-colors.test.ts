import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Färger står i brand/tokens.cjs och används som klasser (bg-ink, text-accent-text, ...). Det här testet fångar en rå
// hexfärg som smugit sig in i koden, och de gamla färgerna från före varumärket.

const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["app", "components", "lib"];
// Ställen där en hexfärg är rätt: tokens i CSS, metadata, e-post (ingen Tailwind där).
const ALLOWED = new Set(["app/globals.css", "app/layout.tsx", "app/manifest.ts", "lib/email/templates.ts"]);
const OLD = ["#14161F", "#F26522", "#F4F4F1", "#C2490C", "#FFE3D2", "#FFF6F0", "#FFF1E8", "#F7F7F4", "#E05A1A", "#FF5F03"];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}
const files = DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !/\.(test|itest)\.tsx?$/.test(f));
const rel = (f: string) => path.relative(ROOT, f);

describe("no stray colors", () => {
  it("has no raw hex colors outside the few files that need them", () => {
    const hits = files.filter((f) => !ALLOWED.has(rel(f))).flatMap((f) => (fs.readFileSync(f, "utf8").match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((m) => `${rel(f)}: ${m}`));
    expect(hits).toEqual([]);
  });
  it("has none of the old pre-brand colors anywhere", () => {
    const hits = files.flatMap((f) => { const s = fs.readFileSync(f, "utf8").toUpperCase(); return OLD.filter((h) => s.includes(h)).map((h) => `${rel(f)}: ${h}`); });
    expect(hits).toEqual([]);
  });
});
