/** Så många dygn efter att ett företag lagts till visas "Nyligen uppdaterad" på leverantören eller listan. */
export const RECENT_DAYS = 3;

/**
 * Texten vid etiketten: hur många nya företag och under vilken tid. Null när inget är nytt, så att etiketten inte visas.
 * Etiketten bygger på företag som lagts till, inte på när insamlingen senast kördes: allt körs varje natt, och då skulle
 * alla leverantörer alltid se nyligen uppdaterade ut. Ren.
 */
export function recentTitle(count: number | null | undefined, days = RECENT_DAYS): string | null {
  if (!count || count < 1) return null;
  return `${count.toLocaleString("sv-SE")} ${count === 1 ? "nytt företag" : "nya företag"} de senaste ${days} dygnen`;
}
