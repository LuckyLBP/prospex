import { ALL_OUTCOME_VALUES, OUTCOMES } from "./outcomes";

// Filtret "Utfall" i företagslistorna: bara de som inte ringts än, bara de som inte svarade, eller ett visst utfall.
// Värdena går i adressen (?utfall=...) och släpps bara igenom om de står här, så inget ur adressen hamnar i SQL.

/** Inte ringd = bolaget har inget loggat utfall hos er. "Att ringa" = inte ringd eller ej svar, det säljaren oftast söker. */
const SPECIAL = ["att-ringa", "ej-ringd", "ej-svar"] as const;

export const OUTCOME_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "Alla utfall" },
  { value: "att-ringa", label: "Inte ringd eller ej svar" },
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

/**
 * Villkoret för ett filter, mot kolumnen `k.outcome` (bolagets egen status). `index` är numret på nästa parameter. Äldre
 * värden som visas som "Kasta" (not_customer, no_website) räknas dit. Ren.
 */
export function outcomeCondition(value: string | undefined, index: number): { sql: string; args: string[] } | null {
  const v = parseOutcomeFilter(value);
  if (!v) return null;
  if (v === "ej-ringd") return { sql: "k.outcome is null", args: [] };
  if (v === "ej-svar") return { sql: "k.outcome = 'no_answer'", args: [] };
  if (v === "att-ringa") return { sql: "(k.outcome is null or k.outcome = 'no_answer')", args: [] };
  if (v === "not_relevant") return { sql: "k.outcome in ('not_relevant', 'not_customer', 'no_website')", args: [] };
  return { sql: `k.outcome = $${index}`, args: [v] };
}
