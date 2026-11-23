import { ALL_OUTCOME_VALUES, OUTCOMES } from "./outcomes";

/** Utfall som lämnar bolaget kvar i listan. Hårdkodade värden ur outcomes.ts, inte från adressen, så de går säkert in i SQL. */
const OPEN_OUTCOMES = OUTCOMES.filter((o) => !o.terminal).map((o) => o.value);

// Filtret "Utfall" i företagslistorna: bara de som inte ringts än, bara de som inte svarade, eller ett visst utfall.
// Värdena går i adressen (?utfall=...) och släpps bara igenom om de står här, så inget ur adressen hamnar i SQL.

/** Inte ringd = bolaget har inget loggat utfall hos er. "Pågående" (värdet att-ringa) = inte ringd eller ett utfall som inte avslutar bolaget. */
const SPECIAL = ["alla", "att-ringa", "ej-ringd", "ej-svar"] as const;

/**
 * Standard i listorna: bara bolag som inte ringts eller har ett pågående utfall (ej svar, upptaget, ring igen, möte bokat).
 * Avslutade utfall (de röda, "Såld", "Redan kund", "Ringer ej numret") döljs för alla säljare. Vill man se dem väljer man
 * "Alla utfall". Det som räknas som pågående är utfallen som inte är `terminal` i outcomes.ts.
 */
export const DEFAULT_OUTCOME_FILTER = "att-ringa";

export const OUTCOME_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "alla", label: "Alla utfall" },
  { value: "att-ringa", label: "Pågående (inte ringd, ej svar, ring igen, möte)" },
  { value: "ej-ringd", label: "Inte ringd" },
  { value: "ej-svar", label: "Ej svar" },
  ...OUTCOMES.filter((o) => o.value !== "no_answer").map((o) => ({ value: o.value as string, label: o.label })),
];

/** Ett värde ur adressen som ett giltigt filter, eller undefined. Ren. */
export function parseOutcomeFilter(raw: string | null | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if ((SPECIAL as readonly string[]).includes(v)) return v;
  return (ALL_OUTCOME_VALUES as readonly string[]).includes(v) ? v : undefined;
}

/** Filtret som gäller: det valda, annars standard. "Alla utfall" ger inget filter alls. Ren. */
export function effectiveOutcomeFilter(raw: string | null | undefined): string | undefined {
  const v = parseOutcomeFilter(raw) ?? DEFAULT_OUTCOME_FILTER;
  return v === "alla" ? undefined : v;
}

/**
 * Villkoret för ett filter, mot kolumnen `k.outcome` (bolagets egen status). `index` är numret på nästa parameter. Äldre
 * värden som visas som "Kasta" (not_customer, no_website) räknas dit. Ren.
 */
export function outcomeCondition(value: string | undefined, index: number): { sql: string; args: string[] } | null {
  const v = parseOutcomeFilter(value);
  if (!v || v === "alla") return null;
  if (v === "ej-ringd") return { sql: "k.outcome is null", args: [] };
  if (v === "ej-svar") return { sql: "k.outcome = 'no_answer'", args: [] };
  if (v === "att-ringa") return { sql: `(k.outcome is null or k.outcome in (${OPEN_OUTCOMES.map((o) => `'${o}'`).join(", ")}))`, args: [] };
  if (v === "not_relevant") return { sql: "k.outcome in ('not_relevant', 'not_customer', 'no_website')", args: [] };
  return { sql: `k.outcome = $${index}`, args: [v] };
}
