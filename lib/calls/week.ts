import { shiftDay, stockholmDay, weekdayShort } from "@/lib/format";

export interface DayCount {
  /** yyyy-mm-dd, Stockholm's calendar. */
  day: string;
  /** "Mån". */
  weekday: string;
  count: number;
  isToday: boolean;
}

/**
 * The last seven Stockholm days, oldest first and ending today, with the
 * number of calls logged on each. Calls outside the window are ignored, so
 * the caller may over-fetch at the edges without skewing a bar.
 */
export function bucketByDay(calledAt: readonly string[], now: Date = new Date()): DayCount[] {
  const today = stockholmDay(now);
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 6));

  const counts = new Map(days.map((day) => [day, 0]));
  for (const moment of calledAt) {
    const day = stockholmDay(moment);
    const current = counts.get(day);
    if (current !== undefined) counts.set(day, current + 1);
  }

  return days.map((day) => ({
    day,
    weekday: weekdayShort(day),
    count: counts.get(day) ?? 0,
    isToday: day === today,
  }));
}
