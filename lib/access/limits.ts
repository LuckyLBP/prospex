// Gränser för hur snabbt uppgifter om företag släpps till en användare. En vanlig ringare tittar på 100 till 300
// företag om dagen, så gränserna märks inte i arbetet men stoppar ett skript som drar hela katalogen.

export const LIMITS: Limits = {
  /** Olika företag per användare och dygn (svensk tid). */
  dailyViews: 500,
  /** Nya företag per användare och minut. */
  minuteViews: 40,
  searchPerMinute: 20,
  listPerMinute: 30,
  /** Andel av dygnsgränsen där adminvyn börjar flagga användaren. */
  flagAt: 0.8,
};

export type Limits = { dailyViews: number; minuteViews: number; searchPerMinute: number; listPerMinute: number; flagAt: number };
export type LimitReason = "daily" | "minute";

export const LIMIT_MESSAGE: Record<LimitReason, string> = {
  daily: `Du har nått dagens gräns på ${LIMITS.dailyViews} företag. Den nollställs vid midnatt. Hör av dig om ni behöver mer.`,
  minute: "Du bläddrar för snabbt. Vänta en stund och försök igen.",
};

export interface ReleasePlan {
  /** Företagen som får släppas, i den ordning de efterfrågades. */
  allowed: string[];
  /** De som räknas mot gränsen nu (inte sedda i dag och inte bolagets egna kontakter). */
  counted: string[];
  blocked: string[];
  reason: LimitReason | null;
}

/**
 * Vilka av de efterfrågade företagen som får släppas. Ett företag som redan visats i dag, eller som bolaget redan har som
 * kontakt, kostar inget. Resten räknas mot det som är kvar av dygnet och av minuten. Ren.
 */
export function planRelease(i: { requested: readonly string[]; free: ReadonlySet<string>; usedToday: number; usedMinute: number }, limits: Limits = LIMITS): ReleasePlan {
  const requested = [...new Set(i.requested)];
  const fresh = requested.filter((id) => !i.free.has(id));
  const dailyLeft = Math.max(0, limits.dailyViews - i.usedToday);
  const minuteLeft = Math.max(0, limits.minuteViews - i.usedMinute);
  const room = Math.min(dailyLeft, minuteLeft);
  const counted = fresh.slice(0, room);
  const countedSet = new Set(counted);
  const blocked = fresh.slice(room);
  return {
    allowed: requested.filter((id) => i.free.has(id) || countedSet.has(id)),
    counted,
    blocked,
    reason: blocked.length === 0 ? null : dailyLeft <= minuteLeft ? "daily" : "minute",
  };
}

/** Går en sökning eller listvisning att göra nu? Ren. */
export function rateDecision(kind: "search" | "list", inLastMinute: number, limits: Limits = LIMITS): { ok: true } | { ok: false; retryAfterSec: number } {
  const max = kind === "search" ? limits.searchPerMinute : limits.listPerMinute;
  return inLastMinute >= max ? { ok: false, retryAfterSec: 60 } : { ok: true };
}
