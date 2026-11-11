/** Så många dygn efter att ett företag lagts till visas "Nyligen uppdaterad" på leverantören eller listan. */
export const RECENT_DAYS = 3;

/** Lades företaget till för högst `days` dygn sedan? Ren. */
export function isRecent(addedAt: Date | string | null | undefined, now: Date = new Date(), days = RECENT_DAYS): boolean {
  if (!addedAt) return false;
  const t = new Date(addedAt).getTime();
  return Number.isFinite(t) && t <= now.getTime() + 60_000 && now.getTime() - t < days * 86_400_000;
}

/** Hovertexten vid "Nytt företag": hos vilken leverantör eller lista det är nytt och när det lades till. Ren. */
export function newCompanyTitle(supplier: string, addedAt: Date | string): string {
  const day = new Date(addedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" });
  return `Nytt hos ${supplier}, tillagt ${day}`;
}

/**
 * Texten vid etiketten: hur många nya företag och under vilken tid. Null när inget är nytt, så att etiketten inte visas.
 * Etiketten bygger på företag som lagts till, inte på när insamlingen senast kördes: allt körs varje natt, och då skulle
 * alla leverantörer alltid se nyligen uppdaterade ut. Ren.
 */
export function recentTitle(count: number | null | undefined, days = RECENT_DAYS): string | null {
  if (!count || count < 1) return null;
  return `${count.toLocaleString("sv-SE")} ${count === 1 ? "nytt företag" : "nya företag"} de senaste ${days} dygnen`;
}
