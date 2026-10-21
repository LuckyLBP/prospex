import type { CheckedRow } from "./store";
import { VERIFY_RULES } from "./verify";

// När en redan kontrollerad domän behöver kontrolleras igen. Utan det skulle en stor byrå kontrollera samma första
// kandidater i varje körning och aldrig nå resten.

const DAY = 24 * 60 * 60 * 1000;
/** En domän utan belägg (eller med en annan byrå) provas om först efter så här länge. */
export const NO_CREDIT_RETRY_MS = 30 * DAY;
/** En sida som inte gick att nå eller släppte inte in oss provas om snabbare. */
export const UNREADABLE_RETRY_MS = 7 * DAY;
/** Så här många körningar i rad utan belägg krävs innan en kund anses ha slutat. */
export const MISSES_BEFORE_LOST = 2;

export const UNREADABLE = new Set(["blocked", "unreachable"]);

/** Ska en ny kandidat hoppas över eftersom den kontrollerats nyligen? Ren. */
export function recentlyChecked(row: CheckedRow | undefined, now: number): boolean {
  if (!row) return false;
  // Ett utslag som gavs med äldre regler gäller inte längre: reglerna har blivit bättre sedan dess.
  if ((row.verdict === "no-credit" || row.verdict === "other-agency") && row.rules < VERIFY_RULES) return false;
  const age = now - row.checkedAt.getTime();
  return age < (UNREADABLE.has(row.verdict) ? UNREADABLE_RETRY_MS : NO_CREDIT_RETRY_MS);
}

/**
 * Utfallet för en BEFINTLIG kund efter en kontroll: antalet körningar i rad utan belägg, och om kunden nu ska anses ha
 * slutat. En sida som inte gick att läsa ändrar ingenting (inget utslag är inget besked). Ren.
 */
export function afterRecheck(verdict: string, previousMisses: number): { misses: number; lost: boolean } {
  if (verdict === "accepted") return { misses: 0, lost: false };
  if (UNREADABLE.has(verdict)) return { misses: previousMisses, lost: false };
  const misses = previousMisses + 1;
  return { misses, lost: misses >= MISSES_BEFORE_LOST };
}
