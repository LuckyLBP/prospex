// Prospex logotyp: gemensamma färger och hjälpare för att rita den. En enda sanning: scripts/brand/build.mjs gör alla
// filer (SVG, ikoner, delningsbild) och components/brand/Logo.tsx ritar samma former i appen.
//
// Logotypen är ett ordmärke: "prospex" i Geist SemiBold med en orange detalj (punkten efter ordet). För de små
// fyrkantiga ytorna (favicon, appikon, hopfälld meny) finns ett "p." på en rundad platta. Själva formerna (bokstävernas
// kurvor) ligger i wordmark.generated.mjs, som skapas ur typsnittet av build-skriptet.

export const COLORS = {
  ink: "#0E1116",
  accent: "#FF6A1A",
  white: "#FFFFFF",
};

export const GRID = 64;
export const TILE_RADIUS = 15;

/** Plattans färger. `ink`: mörk platta med vit bokstav och orange punkt (ljusa ytor, ikoner). `accent`: orange platta med ink-bokstav och ink-punkt (mörka ytor). */
export const TONES = {
  ink: { bg: COLORS.ink, fg: COLORS.white, dot: COLORS.accent },
  accent: { bg: COLORS.accent, fg: COLORS.ink, dot: COLORS.ink },
};

/** "p." som SVG-element på rutnätet 64 x 64. `mark`: MARK eller MARK_SMALL. `bleed`: hela ytan fylld (appikoner). `scale`: storlek på bokstaven. */
export function markSvg(mark, { tone = "ink", bleed = false, scale = 1 } = {}) {
  const t = TONES[tone];
  const inner = `<path fill="${t.fg}" d="${mark.d}"/><circle cx="${mark.dot.cx}" cy="${mark.dot.cy}" r="${mark.dot.r}" fill="${t.dot}"/>`;
  const rect = `<rect width="${GRID}" height="${GRID}" rx="${bleed ? 0 : TILE_RADIUS}" fill="${t.bg}"/>`;
  return rect + (scale === 1 ? inner : `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g>`);
}

/** Ordmärket som SVG-element. `word`: färgen på bokstäverna, `accent`: på den orange detaljen. */
export function wordmarkSvg(w, { word = COLORS.ink, accent = COLORS.accent } = {}) {
  const parts = w.parts.map((p) => `<path fill="${p.accent ? accent : word}" d="${p.d}"/>`).join("");
  const dot = w.dot ? `<circle cx="${w.dot.cx}" cy="${w.dot.cy}" r="${w.dot.r}" fill="${accent}"/>` : "";
  return `<g transform="translate(${w.x} ${w.baseline})">${parts}${dot}</g>`;
}

export const svgDoc = (viewBox, inner, { width, height, title } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""} role="img"${title ? ` aria-label="${title}"` : ""}>${title ? `<title>${title}</title>` : ""}${inner}</svg>`;
