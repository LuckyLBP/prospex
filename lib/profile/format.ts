// Formatering för profilsidan. Ren och klientsäker.

/** 9 659 000 -> "9,7 Mkr", 1 250 000 000 -> "1,3 Mdkr", 235 552 -> "236 tkr". */
export function compactKr(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const one = (v: number) => v.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
  if (abs >= 1e9) return `${one(n / 1e9)} Mdkr`;
  if (abs >= 1e6) return `${one(n / 1e6)} Mkr`;
  if (abs >= 1e3) return `${Math.round(n / 1e3).toLocaleString("sv-SE")} tkr`;
  return `${Math.round(n).toLocaleString("sv-SE")} kr`;
}

export const sv = (n: number) => n.toLocaleString("sv-SE");

/** Hur många hela år sedan ett datum (yyyy-mm-dd). Null om datumet saknas eller är ogiltigt. */
export function yearsSince(date: string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) years--;
  return Math.max(0, years);
}

/** Andel i procent, avrundad, eller null när nämnaren saknas eller är noll. Resultat av kod, inte av AI. */
export function ratioPercent(part: number | null | undefined, whole: number | null | undefined): number | null {
  if (part === null || part === undefined || whole === null || whole === undefined || whole === 0) return null;
  return Math.round((part / whole) * 100);
}

/** "2026-10-05T..." -> "5 okt. 2026". */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Stockholm" });
}

/** "HENÅN" -> "Henån", "UPPLANDS-VÄSBY" -> "Upplands-Väsby". Ord som redan har små bokstäver lämnas som de är. */
export function titleCasePlace(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(/\p{L}[\p{L}'’]*/gu, (w) => (w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase() ? w[0] + w.slice(1).toLowerCase() : w));
}

/** Förändring i procent mellan två år, eller null när något saknas eller basen är noll. */
export function changePercent(now: number | null | undefined, before: number | null | undefined): number | null {
  if (now === null || now === undefined || before === null || before === undefined || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}
