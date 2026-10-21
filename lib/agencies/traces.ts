import type { Agency } from "./match";

// Hur en byrå syns i en kunds sidkod när sidfoten inte säger något. En byrå som bygger på en egen plattform lämnar spår
// överallt: en variabel i ett skript (window.smartproduktion_design_data), ett tema eller tillägg som bär namnet,
// datafält, filer, anrop till byråns egna adresser, en kommentar. Här letas allt sådant fram och namnges, så att varje
// träff går att visa som belägg och att samma spår kan användas för att hitta fler kunder.
//
// Bara tekniska spår räknas. En vanlig länk till byrån någonstans på sidan, eller namnet i löptext, kan en kund också ha
// för att hänvisa till en byrå den inte anlitat, och räknas därför inte.

export type TraceKind = "generator" | "theme" | "plugin" | "identifier" | "attribute" | "asset" | "resource" | "endpoint" | "comment";

export interface Trace {
  kind: TraceKind;
  /** Det som hittades, kort nog att söka på: variabelnamnet, temat, sökvägen. */
  token: string;
  /** Vad som visas som belägg. */
  evidence: string;
}

/** Spår som går att söka på i sidkod hos en tjänst som PublicWWW: ett namn, inte en hel adress. */
export const SEARCHABLE: ReadonlySet<TraceKind> = new Set(["identifier", "attribute", "plugin", "theme"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slug = (b: string) => b.replace(/[^a-z0-9]/gi, "");

/** Byråns varumärkesord, redan framräknade av `agencyBrands`. */
export function findTraces(html: string, agency: Agency, brands: readonly string[]): Trace[] {
  const out: Trace[] = [];
  const add = (t: Trace) => {
    if (!out.some((o) => o.kind === t.kind && o.token === t.token)) out.push(t);
  };
  const domain = esc(agency.domain);

  const generator = /<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["']([^"']*)["']|<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']generator["']/i.exec(html);
  const gen = generator?.[1] ?? generator?.[2];
  if (gen && brands.some((b) => gen.toLowerCase().includes(b))) add({ kind: "generator", token: gen.slice(0, 60), evidence: `Generator: ${gen.slice(0, 60)}` });

  for (const brand of brands) {
    const b = esc(slug(brand));
    if (!b) continue;
    const theme = new RegExp(`/wp-content/themes/([a-z0-9_-]*${b}[a-z0-9_-]*)/`, "i").exec(html);
    if (theme) add({ kind: "theme", token: theme[1], evidence: `Tema: ${theme[1]}` });
    const plugin = new RegExp(`/wp-content/plugins/([a-z0-9_-]*${b}[a-z0-9_-]*)/`, "i").exec(html);
    if (plugin) add({ kind: "plugin", token: plugin[1], evidence: `Tillägg: ${plugin[1]}` });
    // En variabel eller funktion döpt efter byrån: smartproduktion_design_data.
    const id = new RegExp(`(?<![a-z0-9_])(${b}_[a-z][a-z0-9_]{2,})`, "i").exec(html);
    if (id) add({ kind: "identifier", token: id[1], evidence: `Kod: ${id[1]}` });
    // Datafält, CSS-variabler och klasser med byråns namn: data-smartproduktion-id, --smartproduktion-color.
    const attr = new RegExp(`(?<![a-z0-9])((?:data-|--)${b}-[a-z0-9-]{2,})`, "i").exec(html);
    if (attr) add({ kind: "attribute", token: attr[1], evidence: `Kod: ${attr[1]}` });
    // En fil eller mapp med byråns namn på kundens egen domän: /assets/smartproduktion/form.js.
    const asset = new RegExp(`\\b(?:src|href|data-src)\\s*=\\s*["'](?!https?:\\/\\/[a-z0-9.-]*${domain}[\\/"'])([^"']*[/_.-]${b}[/_.-][^"']*)["']`, "i").exec(html);
    if (asset) add({ kind: "asset", token: asset[1].slice(0, 80), evidence: `Fil: ${asset[1].slice(0, 80)}` });
  }

  // Resurser och anrop till byråns egna adresser. Vanliga länkar (<a>) tas bort först: de säger bara att sidan hänvisar dit.
  const withoutLinks = html.replace(/<a\b[^>]*>/gi, "<a>").replace(/mailto:[^"'\s>]*/gi, "");
  if (new RegExp(`<(?:link|script|img)\\b[^>]*\\b(?:src|href)\\s*=\\s*["'][^"']*//[a-z0-9.-]*\\.${domain}/`, "i").test(html)) add({ kind: "resource", token: agency.domain, evidence: `Resurs från ${agency.domain}` });
  else if (new RegExp(`["'](?:https?:)?//(?:[a-z0-9-]+\\.)*${domain}[/:?"']`, "i").test(withoutLinks)) add({ kind: "endpoint", token: agency.domain, evidence: `Anrop till ${agency.domain}` });

  // En kommentar som nämner byrån: <!-- Byggd av Smartproduktion -->.
  for (const brand of brands) {
    const c = new RegExp(`<!--[^>]*?(?<![a-z0-9])${esc(slug(brand))}(?![a-z0-9])[^>]*?-->`, "i").exec(html);
    if (c) add({ kind: "comment", token: brand, evidence: `Kommentar i koden: ${c[0].replace(/\s+/g, " ").slice(0, 70)}` });
  }
  return out;
}
