// Bygger alla varumärkesfiler ur brand/geometry.mjs och typsnittet Geist.
//   node scripts/brand/build.mjs            skriver filerna
//   node scripts/brand/build.mjs --preview <katalog>   skriver också en kontaktyta att titta på
// Körs bara när logotypen ändras. Resultatet checkas in, så bygget på Vercel behöver varken Geist-filen eller opentype.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";
import { COLORS, GRID, glyphSvg, svgDoc, tileSvg } from "../../brand/geometry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = (p) => path.join(root, p);
const write = (p, data) => { fs.mkdirSync(path.dirname(out(p)), { recursive: true }); fs.writeFileSync(out(p), data); console.log("skrev", p); };

const fontFile = (w) => out(`node_modules/geist/dist/fonts/geist-sans/Geist-${w}.ttf`);
const loadFont = (w) => { const b = fs.readFileSync(fontFile(w)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

// ---------------------------------------------------------------- ordmärket
const semibold = loadFont("SemiBold");
const WORD = "prospex";
const SIZE = 46;
const TRACKING = -22; // tusendels em: lite tätare än normalt, som i rubrikerna
const wp = semibold.getPath(WORD, 0, 0, SIZE, { kerning: true, tracking: TRACKING });
const bb = wp.getBoundingBox();
const xHeight = (semibold.tables.os2.sxHeight * SIZE) / semibold.unitsPerEm;
const baseline = GRID / 2 + xHeight / 2; // x-höjdens mitt ligger i plattans mitt
const GAP = 18;
const wordX = GRID + GAP - bb.x1;
const lockupW = Math.ceil(GRID + GAP + (bb.x2 - bb.x1));
const wordD = new opentype.Path();
wp.commands.forEach((c) => wordD.commands.push(c));
const wordPathData = wp.toPathData(2);
const lockupH = GRID;
const lockupInner = (wordFill, tile) => `<g>${tile}</g><path transform="translate(${wordX.toFixed(2)} ${baseline.toFixed(2)})" fill="${wordFill}" d="${wordPathData}"/>`;

write("brand/wordmark.generated.mjs", `// Genererad av scripts/brand/build.mjs. Ändra inte för hand.
export const WORDMARK = ${JSON.stringify({ d: wordPathData, x: +wordX.toFixed(2), baseline: +baseline.toFixed(2), width: lockupW, height: lockupH, gap: GAP })};
`);

// ---------------------------------------------------------------- SVG-filer
const tile = tileSvg();
write("public/brand/mark.svg", svgDoc(`0 0 ${GRID} ${GRID}`, tile, { title: "Prospex" }));
write("public/brand/mark-mono.svg", svgDoc("14 10 40 44", glyphSvg({ fg: COLORS.ink }), { title: "Prospex" }));
write("public/brand/logo.svg", svgDoc(`0 0 ${lockupW} ${lockupH}`, lockupInner(COLORS.ink, tile), { title: "Prospex" }));
write("public/brand/logo-dark.svg", svgDoc(`0 0 ${lockupW} ${lockupH}`, lockupInner(COLORS.white, tile), { title: "Prospex" }));
write("public/brand/logo-mono.svg", svgDoc(`0 0 ${lockupW} ${lockupH}`, lockupInner(COLORS.ink, tileSvg({ bg: COLORS.ink, fg: COLORS.white })), { title: "Prospex" }));
write("app/icon.svg", svgDoc(`0 0 ${GRID} ${GRID}`, tileSvg({ small: true }))); // favicon: större hål, ingen prick

// ---------------------------------------------------------------- PNG
const png = (svg, size, opts = {}) => sharp(Buffer.from(svg), { density: 384 }).resize(size, opts.height ?? size).png().toBuffer();
const sq = (inner, size) => png(svgDoc(`0 0 ${GRID} ${GRID}`, inner), size);

const small = tileSvg({ small: true });
// Appikoner: hela ytan orange, bokstaven mindre. Systemet (iOS, Android) rundar hörnen själv.
const bleed = tileSvg({ bleed: true, scale: 0.82 });
const maskable = tileSvg({ bleed: true, scale: 0.62 }); // innanför den säkra zonen på 80 %

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

// logotypen som PNG för e-post (e-postprogram blockerar inbäddad SVG): ink på transparent, 3x
write("public/brand/email-logo.png", await png(svgDoc(`0 0 ${lockupW} ${lockupH}`, lockupInner(COLORS.ink, tile)), lockupW * 3, { height: lockupH * 3 }));
write("public/brand/logo.png", await png(svgDoc(`0 0 ${lockupW} ${lockupH}`, lockupInner(COLORS.ink, tile)), lockupW * 6, { height: lockupH * 6 }));

// ---------------------------------------------------------------- delningsbild 1200 x 630
const medium = loadFont("Medium");
const line = (text, size) => { const p = medium.getPath(text, 0, 0, size, { kerning: true, tracking: -25 }); return { d: p.toPathData(2), w: p.getBoundingBox().x2 }; };
const l1 = line("Ring företag som redan", 62), l2 = line("köper det du säljer.", 62);
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<defs><radialGradient id="g" cx="0.85" cy="0.1" r="0.9"><stop offset="0" stop-color="${COLORS.accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${COLORS.accent}" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="${COLORS.ink}"/><rect width="1200" height="630" fill="url(#g)"/>
<g transform="translate(80 72) scale(1.4)">${lockupInner(COLORS.white, tile)}</g>
<g fill="${COLORS.white}"><path transform="translate(80 372)" d="${l1.d}"/><path transform="translate(80 452)" d="${l2.d}"/></g>
<rect x="80" y="520" width="120" height="6" rx="3" fill="${COLORS.accent}"/>
</svg>`;
const ogPng = await sharp(Buffer.from(og), { density: 192 }).resize(1200, 630).png().toBuffer();
write("app/opengraph-image.png", ogPng);
write("app/twitter-image.png", ogPng);

// ---------------------------------------------------------------- förhandsvisning
const i = process.argv.indexOf("--preview");
if (i > 0) {
  const dir = process.argv[i + 1];
  const cell = async (svg, w, h, bg) => ({ input: await sharp(Buffer.from(svg), { density: 384 }).resize(w, h).png().toBuffer(), bg });
  const W = 1500, H = 760;
  const sheet = sharp({ create: { width: W, height: H, channels: 4, background: "#F5F4F0" } });
  const dark = await sharp({ create: { width: W, height: 300, channels: 4, background: COLORS.ink } }).png().toBuffer();
  const parts = [{ input: dark, left: 0, top: 460 }];
  let x = 40;
  for (const [svg, s] of [[small, 16], [small, 32], [small, 48], [tile, 64], [tile, 128], [tile, 256]]) {
    parts.push({ input: await sharp(Buffer.from(svgDoc(`0 0 ${GRID} ${GRID}`, svg)), { density: 384 }).resize(s, s).png().toBuffer(), left: x, top: 40 + (256 - s) / 2 });
    x += s + 40;
  }
  parts.push({ input: await sharp(Buffer.from(svgDoc(`0 0 ${lockupW} ${lockupH}`, lockupInner(COLORS.ink, tile))), { density: 384 }).resize(Math.round(lockupW * 2.6), Math.round(lockupH * 2.6)).png().toBuffer(), left: 40, top: 330 });
  parts.push({ input: await sharp(Buffer.from(svgDoc(`0 0 ${lockupW} ${lockupH}`, lockupInner(COLORS.white, tile))), { density: 384 }).resize(Math.round(lockupW * 2.6), Math.round(lockupH * 2.6)).png().toBuffer(), left: 40, top: 500 });
  parts.push({ input: await sharp(Buffer.from(svgDoc(`0 0 ${GRID} ${GRID}`, bleed)), { density: 384 }).resize(120, 120).png().toBuffer(), left: 900, top: 330 });
  parts.push({ input: await sharp(Buffer.from(svgDoc(`0 0 ${GRID} ${GRID}`, maskable)), { density: 384 }).resize(120, 120).png().toBuffer(), left: 1040, top: 330 });
  parts.push({ input: await sharp(ogPng).resize(480, 252).png().toBuffer(), left: 900, top: 490 });
  fs.mkdirSync(dir, { recursive: true });
  await sheet.composite(parts).png().toFile(path.join(dir, "preview.png"));
  console.log("förhandsvisning:", path.join(dir, "preview.png"));
}
