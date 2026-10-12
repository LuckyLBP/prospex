// Prospex logotypens geometri och färger. En enda sanning: scripts/brand/build.mjs gör alla filer av den här
// (SVG, ikoner, delningsbild) och components/brand/Logo.tsx ritar samma former i appen.
//
// Märket är ett "P" av en stam och en rund kupa, med en liten prick i hålet: en köpsignal som hittats. Ritat på ett
// rutnät om 64 x 64. Mitten av bokstaven ligger vid (34.5, 32.5).

export const COLORS = {
  ink: "#0E1116",
  accent: "#FF6A1A",
  white: "#FFFFFF",
};

export const GRID = 64;
export const TILE_RADIUS = 15;
export const GLYPH_CENTER = [34.5, 32.5];

/** Stam och kupa i ett stycke. Hålet läggs till med fyllningsregeln evenodd. */
export const P_D = "M19 20A5 5 0 0 1 24 15H35A15 15 0 0 1 35 45H29A5 5 0 0 1 19 45Z";
/** Hålet i kupan. Det stora märket har ett mindre hål med en prick i, det lilla (favicon) ett större hål utan prick. */
export const HOLE = { cx: 35, cy: 30, r: 7, rSmall: 8.5 };
export const DOT = { cx: 35, cy: 30, r: 3 };

export const holeD = (r) => `M${HOLE.cx - r} ${HOLE.cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Bokstaven som SVG-element i färgen `fg`. `small`: större hål och ingen prick, så att den håller på 16 px. */
export function glyphSvg({ fg = COLORS.ink, small = false, dot = true } = {}) {
  const d = P_D + holeD(small ? HOLE.rSmall : HOLE.r);
  return `<path fill="${fg}" fill-rule="evenodd" d="${d}"/>` + (dot && !small ? `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${fg}"/>` : "");
}

/** Märket på en rundad platta. `bleed`: hela ytan fylld (appikoner, där systemet själv rundar hörnen) och bokstaven ritas mindre. */
export function tileSvg({ bg = COLORS.accent, fg = COLORS.ink, small = false, bleed = false, scale = 1 } = {}) {
  const [cx, cy] = GLYPH_CENTER;
  const rect = `<rect width="${GRID}" height="${GRID}" rx="${bleed ? 0 : TILE_RADIUS}" fill="${bg}"/>`;
  const glyph = scale === 1 ? glyphSvg({ fg, small }) : `<g transform="translate(32 32) scale(${scale}) translate(${-cx} ${-cy})">${glyphSvg({ fg, small })}</g>`;
  return rect + glyph;
}

export const svgDoc = (viewBox, inner, { width, height, title } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""} role="img"${title ? ` aria-label="${title}"` : ""}>${title ? `<title>${title}</title>` : ""}${inner}</svg>`;
