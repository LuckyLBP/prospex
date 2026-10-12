import { decodeEntities } from "@/lib/enrich/extract";

// Var på en webbplats logotypen troligast finns, bäst först. Ren och testad. Utökad version av gamla portalens
// (src/lib/profiles/logo-candidates.ts), som bara läste <link>-taggar.
//
//   1. apple-touch-icon      nästan alltid en kvadratisk PNG på 180 px: rätt form för en logoruta
//   2. icon med storlek      den största först, och bara om den är minst 64 px
//   3. logotyp i JSON-LD     Organization.logo, vilket sajten själv pekar ut som sin logotyp
//   4. bild i sidhuvudet     en <img> med "logo" i src, alt, klass eller id
//   5. icon utan storlek     ofta en favicon på 16 px, men bättre än ingenting
//   6. og:image              ofta en banner, därför sist
//   7. /apple-touch-icon.png på domänens rot
//
// SVG och ICO tas aldrig (hinken tar inte emot SVG, som kan bära skript, och en ICO går inte att lita på i en
// <img>). Slutlig typ avgörs av filens innehåll när den hämtas; ändelsen här är bara en tidig gallring.

const SKIP = /\.(svg|ico)(\?|#|$)/i;

function attribute(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

function largestSize(sizes: string | null): number {
  if (!sizes) return 0;
  return Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/gi)].map((m) => Number(m[1])));
}

function resolve(href: string, base: string): string | null {
  try {
    const url = new URL(decodeEntities(href).trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function jsonLdLogos(html: string): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth = 0): void => {
    if (!v || depth > 6) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const logo = o.logo;
    if (typeof logo === "string") out.push(logo);
    else if (logo && typeof logo === "object") {
      const u = (logo as Record<string, unknown>).url ?? (logo as Record<string, unknown>).contentUrl;
      if (typeof u === "string") out.push(u);
    }
    for (const value of Object.values(o)) if (value && typeof value === "object") visit(value, depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      /* ett trasigt block hoppas över */
    }
  }
  return out;
}

export function logoCandidates(html: string, pageUrl: string): string[] {
  const ranked: { url: string; rank: number; size: number; order: number }[] = [];
  let order = 0;
  const add = (href: string | null, rank: number, size = 0) => {
    if (!href || SKIP.test(href) || href.startsWith("data:")) return;
    const url = resolve(href, pageUrl);
    if (url && !SKIP.test(url)) ranked.push({ url, rank, size, order: order++ });
  };

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rels = (attribute(tag, "rel")?.toLowerCase() ?? "").split(/\s+/);
    const href = attribute(tag, "href");
    if (!href) continue;
    const apple = rels.includes("apple-touch-icon") || rels.includes("apple-touch-icon-precomposed");
    const icon = rels.includes("icon");
    if (!apple && !icon) continue;
    const type = attribute(tag, "type")?.toLowerCase() ?? "";
    if (type.includes("svg") || type.includes("icon")) continue;
    const size = largestSize(attribute(tag, "sizes"));
    if (icon && !apple && size > 0 && size < 64) continue;
    add(href, apple ? 1 : size > 0 ? 2 : 5, size);
  }

  for (const logo of jsonLdLogos(html)) add(logo, 3);

  // Bilder i sidhuvudet: det som står före första <main> eller de första 20 000 tecknen.
  const head = html.slice(0, Math.min(html.search(/<main\b/i) > 0 ? html.search(/<main\b/i) : 20_000, 20_000));
  for (const tag of head.match(/<img\b[^>]*>/gi) ?? []) {
    const src = attribute(tag, "src") ?? attribute(tag, "data-src");
    if (!src) continue;
    const hint = [src, attribute(tag, "alt"), attribute(tag, "class"), attribute(tag, "id")].filter(Boolean).join(" ");
    if (/logo/i.test(hint)) add(src, 4);
  }

  const og = /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*>/i.exec(html)?.[0];
  if (og) add(attribute(og, "content"), 6);

  add("/apple-touch-icon.png", 7);

  const seen = new Set<string>();
  return ranked
    .sort((a, b) => a.rank - b.rank || b.size - a.size || a.order - b.order)
    .map((r) => r.url)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}
