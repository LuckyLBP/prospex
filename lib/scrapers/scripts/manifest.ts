/**
 * The registered custom scripts, as data.
 *
 * DELIBERATELY FREE OF SERVER IMPORTS. The profile form is a Client Component
 * and needs the list to render its dropdown; the handlers themselves reach for
 * the service-role Supabase client and could never be bundled for a browser.
 * Splitting the names from the implementations is what lets both sides read
 * the same list instead of two lists that drift.
 */
export const SCRIPT_KEYS = [
  "bokadirekt-table-sync",
  "brabyggare",
  "eniro-table-sync",
  "example",
  "servicefinder",
  "dorunner",
  "boka",
] as const;

export type ScriptKey = (typeof SCRIPT_KEYS)[number];

export const SCRIPTS: Record<ScriptKey, { label: string; description: string }> = {
  "bokadirekt-table-sync": {
    label: "Bokadirekt (tabellsynk)",
    description:
      "Läser bokadirekt_companies i databasen och lägger in raderna som poster. Ingen webbplats besöks.",
  },
  brabyggare: {
    label: "BraByggare (hantverkarprofiler)",
    description:
      "Läser BraByggares sitemap och hämtar varje hantverkarprofil: namn, webbplats, telefon, mejl och organisationsnummer.",
  },
  "eniro-table-sync": {
    label: "Eniro (tabellsynk)",
    description:
      "Läser eniro_companies i databasen och lägger in raderna som poster. Ingen webbplats besöks.",
  },
  servicefinder: {
    label: "Servicefinder (företagsprofiler)",
    description:
      "Läser Servicefinders sitemap och hämtar varje företagsprofil: namn, telefon och org.nr. Aktiva profiler och inaktiva med omdöme.",
  },
  dorunner: {
    label: "Dorunner (företagskatalogen)",
    description:
      "Läser Dorunners katalog och sitemap och hämtar varje företagsprofil: namn, betyg och webbplats. Webbplatserna berikas efteråt.",
  },
  boka: {
    label: "Boka.se (bokningssidor)",
    description:
      "Läser Boka.ses sitemap och hämtar varje bokningssida: namn, telefon, adress och webbplats. Webbplatserna berikas efteråt.",
  },
  example: {
    label: "Exempel (tre domäner)",
    description:
      "Tre fasta domäner som körs genom berikningen. Finns för att visa hur ett skript ser ut.",
  },
};

export function isScriptKey(value: unknown): value is ScriptKey {
  return typeof value === "string" && (SCRIPT_KEYS as readonly string[]).includes(value);
}

export function listScripts(): { key: ScriptKey; label: string; description: string }[] {
  return SCRIPT_KEYS.map((key) => ({ key, ...SCRIPTS[key] }));
}
