// Bygger alla varumärkesfiler ur brand/geometry.mjs och typsnittet Geist.
//   node scripts/brand/build.mjs                        skriver filerna
//   node scripts/brand/build.mjs --preview <katalog>    skriver också en kontaktyta att titta på
//   BRAND_ACCENT=dot|x|none node scripts/brand/build.mjs    vilken orange detalj ordmärket har (standard: dot)
// Körs bara när logotypen ändras. Resultatet checkas in, så bygget på Vercel behöver varken Geist-filen eller opentype.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
import { COLORS, GRID, markSvg, svgDoc, wordmarkSvg } from "../../brand/geometry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = (p) => path.join(root, p);
const write = (p, data) => { fs.mkdirSync(path.dirname(out(p)), { recursive: true }); fs.writeFileSync(out(p), data); console.log("skrev", p); };
const loadFont = (w) => { const b = fs.readFileSync(out(`node_modules/geist/dist/fonts/geist-sans/Geist-${w}.ttf`)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

const ACCENT = process.env.BRAND_ACCENT ?? "dot";
const semibold = loadFont("SemiBold");
const round = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- ordmärket
const WORD = "prospex";
const SIZE = 46;
const TRACKING = -22; // tusendels em: lite tätare än normalt, som i rubrikerna
const glyphs = semibold.getPaths(WORD, 0, 0, SIZE, { kerning: true, tracking: TRACKING });
const boxes = glyphs.map((g) => g.getBoundingBox());
const minX = Math.min(...boxes.map((b) => b.x1)), maxX = Math.max(...boxes.map((b) => b.x2));
const data = (gs) => gs.map((g) => g.toPathData(2)).join("");
const xHeight = (semibold.tables.os2.sxHeight * SIZE) / semibold.unitsPerEm;
const baseline = round(GRID / 2 + xHeight / 2); // x-höjdens mitt ligger i mitten av höjden

const dotR = round(0.08 * SIZE);
const dot = ACCENT === "dot" ? { cx: round(maxX + 0.05 * SIZE + dotR), cy: -dotR, r: dotR } : null;
const parts = ACCENT === "x"
  ? [{ d: data(glyphs.slice(0, -1)), accent: false }, { d: data(glyphs.slice(-1)), accent: true }]
  : [{ d: data(glyphs), accent: false }];
const width = Math.ceil((dot ? dot.cx + dot.r : maxX) - minX + 2);
const WORDMARK = { parts, dot, x: round(-minX + 1), baseline, width, height: GRID };

// ---------------------------------------------------------------- "p." på en platta
function transformPath(p, s, tx, ty) {
  const m = new opentype.Path();
  for (const c of p.commands) {
    const n = { type: c.type };
    for (const k of ["x", "y", "x1", "y1", "x2", "y2"]) if (k in c) n[k] = k.startsWith("x") ? s * c[k] + tx : s * c[k] + ty;
    m.commands.push(n);
  }
  return m;
}
function buildMark({ groupWidth, dotScale }) {
  const p = semibold.getPath("p", 0, 0, 100, { kerning: true });
  const b = p.getBoundingBox();
  const r = 8 * dotScale, gap = 6;
  const gx2 = b.x2 + gap + 2 * r;
  const w = gx2 - b.x1, h = b.y2 - b.y1;
  const s = Math.min(groupWidth / w, 38 / h);
  const tx = 32 - (s * (b.x1 + gx2)) / 2, ty = 32 - (s * (b.y1 + b.y2)) / 2;
  const d = transformPath(p, s, tx, ty).toPathData(2);
  return { d, dot: { cx: round(s * (b.x2 + gap + r) + tx), cy: round(s * -r + ty), r: round(s * r) } };
}
const MARK = buildMark({ groupWidth: 38, dotScale: 1 });
const MARK_SMALL = buildMark({ groupWidth: 44, dotScale: 1.35 }); // större prick och bokstav: håller på 16 px

write("brand/wordmark.generated.mjs", `// Genererad av scripts/brand/build.mjs (BRAND_ACCENT=${ACCENT}). Ändra inte för hand.
export const WORDMARK = ${JSON.stringify(WORDMARK)};
export const MARK = ${JSON.stringify(MARK)};
export const MARK_SMALL = ${JSON.stringify(MARK_SMALL)};
`);

// ---------------------------------------------------------------- SVG-filer
const lockup = (word, accent) => svgDoc(`0 0 ${WORDMARK.width} ${WORDMARK.height}`, wordmarkSvg(WORDMARK, { word, accent }), { title: "Prospex" });
write("public/brand/logo.svg", lockup(COLORS.ink, COLORS.accent));
write("public/brand/logo-dark.svg", lockup(COLORS.white, COLORS.accent));
write("public/brand/logo-mono.svg", lockup(COLORS.ink, COLORS.ink));
write("public/brand/mark.svg", svgDoc(`0 0 ${GRID} ${GRID}`, markSvg(MARK, { tone: "ink" }), { title: "Prospex" }));
write("public/brand/mark-accent.svg", svgDoc(`0 0 ${GRID} ${GRID}`, markSvg(MARK, { tone: "accent" }), { title: "Prospex" }));
write("app/icon.svg", svgDoc(`0 0 ${GRID} ${GRID}`, markSvg(MARK_SMALL, { tone: "ink" })));
fs.rmSync(out("public/brand/mark-mono.svg"), { force: true });

// ---------------------------------------------------------------- PNG
const png = (svg, w, h) => sharp(Buffer.from(svg), { density: 384 }).resize(w, h).png().toBuffer();
const sq = (inner, size) => png(svgDoc(`0 0 ${GRID} ${GRID}`, inner), size, size);

const small = markSvg(MARK_SMALL, { tone: "ink" });
// Appikoner: hela ytan mörk, "p." något större. Systemet (iOS, Android) rundar hörnen själv.
const bleed = markSvg(MARK, { tone: "ink", bleed: true, scale: 1.15 });
const maskable = markSvg(MARK, { tone: "ink", bleed: true, scale: 0.95 }); // innanför den säkra zonen på 80 %

write("app/apple-icon.png", await sq(bleed, 180));
write("public/brand/icon-192.png", await sq(bleed, 192));
write("public/brand/icon-512.png", await sq(bleed, 512));
write("public/brand/icon-maskable-512.png", await sq(maskable, 512));

// favicon.ico med 16, 32 och 48 px (PNG i en ICO-behållare)
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map((s) => sq(small, s)));
const head = Buffer.alloc(6 + 16 * icoSizes.length);
head.writeUInt16LE(1, 2); head.writeUInt16LE(icoSizes.length, 4);
let offset = head.length;
icoSizes.forEach((s, i) => {
  const o = 6 + 16 * i;
  head.writeUInt8(s, o); head.writeUInt8(s, o + 1); head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(icoPngs[i].length, o + 8); head.writeUInt32LE(offset, o + 12);
  offset += icoPngs[i].length;
});
write("app/favicon.ico", Buffer.concat([head, ...icoPngs]));

// logotypen som PNG (e-postprogram blockerar inbäddad SVG): ink och orange på transparent
const lockupInner = (word, accent) => wordmarkSvg(WORDMARK, { word, accent });
write("public/brand/email-logo.png", await png(svgDoc(`0 0 ${WORDMARK.width} ${WORDMARK.height}`, lockupInner(COLORS.ink, COLORS.accent)), WORDMARK.width * 3, WORDMARK.height * 3));
write("public/brand/logo.png", await png(svgDoc(`0 0 ${WORDMARK.width} ${WORDMARK.height}`, lockupInner(COLORS.ink, COLORS.accent)), WORDMARK.width * 6, WORDMARK.height * 6));

// ---------------------------------------------------------------- delningsbild 1200 x 630
const medium = loadFont("Medium");
const line = (text, size) => medium.getPath(text, 0, 0, size, { kerning: true, tracking: -25 }).toPathData(2);
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<defs><radialGradient id="g" cx="0.85" cy="0.1" r="0.9"><stop offset="0" stop-color="${COLORS.accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${COLORS.accent}" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="${COLORS.ink}"/><rect width="1200" height="630" fill="url(#g)"/>
<g transform="translate(80 62) scale(2.1)">${lockupInner(COLORS.white, COLORS.accent)}</g>
<g fill="${COLORS.white}"><path transform="translate(80 372)" d="${line("Ring företag som redan", 62)}"/><path transform="translate(80 452)" d="${line("köper det du säljer.", 62)}"/></g>
<rect x="80" y="520" width="120" height="6" rx="3" fill="${COLORS.accent}"/>
</svg>`;
const ogPng = await png(og, 1200, 630);
write("app/opengraph-image.png", ogPng);
write("app/twitter-image.png", ogPng);

// ---------------------------------------------------------------- förhandsvisning
const i = process.argv.indexOf("--preview");
if (i > 0) {
  const dir = process.argv[i + 1];
  const W = 1500, H = 820;
  const dark = await sharp({ create: { width: W, height: 330, channels: 4, background: COLORS.ink } }).png().toBuffer();
  const parts = [{ input: dark, left: 0, top: 490 }];
  const put = async (svg, w, h, left, top) => parts.push({ input: await png(svg, w, h), left, top });
  let x = 40;
  for (const [mk, tone, s] of [[MARK_SMALL, "ink", 16], [MARK_SMALL, "ink", 32], [MARK_SMALL, "ink", 48], [MARK, "ink", 64], [MARK, "ink", 128], [MARK, "accent", 128]]) {
    await put(svgDoc(`0 0 ${GRID} ${GRID}`, markSvg(mk, { tone })), s, s, x, 40 + (128 - s) / 2); x += s + 36;
  }
  const lw = Math.round(WORDMARK.width * 3.4), lh = Math.round(WORDMARK.height * 3.4);
  await put(svgDoc(`0 0 ${WORDMARK.width} ${WORDMARK.height}`, lockupInner(COLORS.ink, COLORS.accent)), lw, lh, 40, 210);
  await put(svgDoc(`0 0 ${WORDMARK.width} ${WORDMARK.height}`, lockupInner(COLORS.white, COLORS.accent)), lw, lh, 40, 540);
  await put(svgDoc(`0 0 ${GRID} ${GRID}`, bleed), 120, 120, 760, 230);
  await put(svgDoc(`0 0 ${GRID} ${GRID}`, maskable), 120, 120, 900, 230);
  parts.push({ input: await sharp(ogPng).resize(560, 294).png().toBuffer(), left: 760, top: 500 });
  fs.mkdirSync(dir, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: "#F5F4F0" } }).composite(parts).png().toFile(path.join(dir, "preview.png"));
  console.log("förhandsvisning:", path.join(dir, "preview.png"));
}
