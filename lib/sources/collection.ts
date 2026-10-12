import { agencyConfigSchema, domainlistConfigSchema, googleplacesConfigSchema, publicwwwConfigSchema, scriptConfigSchema, viewdnsConfigSchema } from "./schema";
import { parsePlacesConfig } from "@/lib/lists-config";

// Klientsäker och ren: läser insamlingsinställningarna ur ett formulär och validerar dem med samma
// scheman som körningen använder, så att en config som sparas också går att köra.

export const METHODS = ["publicwww", "viewdns", "googleplaces", "domainlist", "script", "agency"] as const;
export type Method = (typeof METHODS)[number];

export const METHOD_INFO: Record<Method, { label: string; hint: string }> = {
  publicwww: { label: "PublicWWW", hint: "Söker i webbplatsers källkod efter ett spår, till exempel en byrås signatur. Ett anrop per körning." },
  viewdns: { label: "ViewDNS", hint: "Domäner på samma server, namnserver eller ägare. Upp till 5 sidor per körning." },
  googleplaces: { label: "Google Places", hint: "Söktermer gånger orter. Kostar anrop, och gratisnivån är 1 000 i månaden." },
  domainlist: { label: "Domänlista", hint: "En inklistrad lista med domäner, en per rad." },
  script: { label: "Skript", hint: "Ett färdigt skript för en känd källa." },
  agency: { label: "Byrå", hint: "Hittar byråns kunder och lägger in dem när kundens egen sajt visar byrån i sidfoten." },
};

export type Collection =
  | { ok: true; method: Method | null; config: Record<string, unknown>; enrichSites: boolean; requests?: number }
  | { ok: false; error: string };

/** `get` läser ett fält ur formuläret (FormData.get som sträng). Tom metod betyder ingen insamling. */
export function readCollection(get: (key: string) => string): Collection {
  const enrichSites = get("enrich_sites") === "on";
  const method = get("method");
  if (!method) return { ok: true, method: null, config: {}, enrichSites };
  if (!(METHODS as readonly string[]).includes(method)) return { ok: false, error: "Okänd insamlingsmetod." };

  const done = (parsed: { success: true; data: unknown } | { success: false; error: { issues: { message: string }[] } }, m: Method): Collection =>
    parsed.success ? { ok: true, method: m, config: parsed.data as Record<string, unknown>, enrichSites } : { ok: false, error: parsed.error.issues[0]?.message ?? "Ogiltiga inställningar." };

  switch (method as Method) {
    case "publicwww":
      return done(publicwwwConfigSchema.safeParse({ query: get("pww_query"), maxResults: get("pww_max") || undefined }), "publicwww");
    case "viewdns":
      return done(viewdnsConfigSchema.safeParse({ endpoint: get("vd_endpoint"), target: get("vd_target"), maxPages: get("vd_pages") || undefined }), "viewdns");
    case "domainlist":
      return done(domainlistConfigSchema.safeParse({ domains: get("dl_domains") }), "domainlist");
    case "agency":
      return done(agencyConfigSchema.safeParse({ agencyName: get("ag_name"), domain: get("ag_domain"), maxCandidates: get("ag_max") || undefined, useViewdns: get("ag_viewdns") === "on", useClaude: get("ag_claude") === "on" }), "agency");
    case "script":
      return done(scriptConfigSchema.safeParse({ script: get("script_key") }), "script");
    case "googleplaces": {
      // Samma regler som kostnadsberäkningen i formuläret, och samma form som körningen läser.
      const p = parsePlacesConfig({ queries: get("gp_queries"), locations: get("gp_locations"), maxPages: get("gp_pages") || 3 });
      if (!p.ok) return { ok: false, error: p.error };
      const z = googleplacesConfigSchema.safeParse(p.config);
      return z.success ? { ok: true, method: "googleplaces", config: p.config, enrichSites, requests: p.requests } : { ok: false, error: z.error.issues[0]?.message ?? "Ogiltiga inställningar." };
    }
  }
}

/** Fältens startvärden ur en sparad config, för formuläret. */
export function collectionDefaults(method: string | null, config: unknown) {
  const c = (config ?? {}) as Record<string, unknown>;
  const s = (k: string, d = "") => (typeof c[k] === "string" ? (c[k] as string).replace(/\r/g, "") : d);
  const n = (k: string, d: number) => (typeof c[k] === "number" ? (c[k] as number) : d);
  return {
    method: (METHODS as readonly string[]).includes(method ?? "") ? (method as Method) : ("" as const),
    pww_query: s("query"), pww_max: n("maxResults", 1000),
    vd_endpoint: s("endpoint", "reverseip"), vd_target: s("target"), vd_pages: n("maxPages", 1),
    dl_domains: s("domains"),
    script_key: s("script", "example"),
    ag_name: s("agencyName"), ag_domain: s("domain"), ag_max: n("maxCandidates", 1000), ag_viewdns: c.useViewdns !== false, ag_claude: c.useClaude !== false,
    gp_queries: s("queries"), gp_locations: s("locations"), gp_pages: n("maxPages", 3),
  };
}
