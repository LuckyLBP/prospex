import { addDays, dateKey, mondayOf } from "@/lib/time";

export type QuickDate = { key: "tomorrow" | "in2" | "nextweek"; label: string; date: string };

/**
 * Snabbval för "ring igen", i svensk tid. "Nästa vecka" är nästa måndag, och om den redan är
 * ett av de andra valen tar vi måndagen efter, så att knapparna aldrig visar samma dag två gånger.
 */
export function quickCallbackDates(now: Date = new Date()): QuickDate[] {
  const today = dateKey(now);
  const tomorrow = addDays(today, 1);
  const in2 = addDays(today, 2);
  let monday = mondayOf(addDays(today, 7));
  while (monday === tomorrow || monday === in2) monday = addDays(monday, 7);
  return [
    { key: "tomorrow", label: "Imorgon", date: tomorrow },
    { key: "in2", label: "Om 2 dagar", date: in2 },
    { key: "nextweek", label: "Nästa vecka", date: monday },
  ];
}

/** Förslag på mötestid: imorgon klockan 10, som värde för <input type="datetime-local">. */
export const defaultMeeting = (now: Date = new Date()) => `${addDays(dateKey(now), 1)}T10:00`;
