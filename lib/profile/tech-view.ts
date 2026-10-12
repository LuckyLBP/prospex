import type { CompanyProfile, Detection } from "./types";

// Ordnar det som hittats på och runt webbplatsen till rutor per kategori, för profilens teknikdel. Ren och testad.

export interface TechTile {
  /** Detektor-id för ikonen, när det finns. */
  id: string | null;
  name: string;
  detail: string | null;
}
export interface TechGroup {
  title: string;
  tiles: TechTile[];
}

const TITLE: Record<string, string> = {
  plattform: "Plattform", "e-handel": "E-handel", betalning: "Betalning", bokning: "Bokning", annonsering: "Annonsering", analys: "Analys", säljverktyg: "Säljverktyg",
  marknadsautomation: "Marknadsföring", "e-post": "E-post", chatt: "Chatt", samtycke: "Samtycke", omdömen: "Omdömen", widget: "Widgets", formulär: "Formulär",
  ramverk: "Ramverk", cms: "Tillägg", drift: "Drift", domän: "Domän", verifiering: "Verifiering",
};
const ORDER = ["plattform", "e-handel", "betalning", "bokning", "annonsering", "analys", "säljverktyg", "marknadsautomation", "e-post", "chatt", "samtycke", "omdömen", "formulär", "widget", "ramverk", "cms", "drift", "domän", "verifiering"];

export function techGroups(profile: Pick<CompanyProfile, "website" | "marketing" | "facts">): TechGroup[] {
  const groups = new Map<string, TechTile[]>();
  const seen = new Set<string>();
  const add = (cat: string, tile: TechTile) => {
    const key = `${cat}|${tile.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    groups.set(cat, [...(groups.get(cat) ?? []), tile]);
  };

  const audit = profile.website.audit;
  if (audit?.cms) add("plattform", { id: null, name: audit.cms, detail: audit.cmsVersion });
  if (audit?.builder) add("plattform", { id: null, name: audit.builder, detail: null });
  if (audit?.booking) add("bokning", { id: null, name: audit.booking, detail: null });

  const fromDetection = (d: Detection) => add(d.category, { id: d.id, name: d.name, detail: d.detail ?? null });
  profile.website.tech.forEach(fromDetection);
  profile.marketing.tech.forEach(fromDetection);

  for (const f of profile.facts) {
    if (f.kind !== "dns" || !f.detector) continue;
    const cat = /^(mail|spf)-/.test(f.detector) ? "e-post" : f.detector.startsWith("ns-") ? "domän" : "verifiering";
    add(cat, { id: f.detector, name: f.label, detail: f.value === "finns på sidan" ? null : f.value });
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)))
    .map(([cat, tiles]) => ({ title: TITLE[cat] ?? cat, tiles }));
}

/** Antal tekniker och spår, för nyckeltalet. */
export function techCount(groups: TechGroup[]): number {
  return groups.reduce((n, g) => n + g.tiles.length, 0);
}
