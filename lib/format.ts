/**
 * Display formatting, in Swedish, in one place.
 *
 * Every date in this app is a moment (timestamptz) shown to people in Sweden,
 * so the formatters are pinned to sv-SE and Europe/Stockholm rather than the
 * server's locale -- a Vercel function runs in UTC and would otherwise print
 * a run that finished at 01:30 as having finished the previous day.
 */
const DATE_TIME = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

const DATE = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeZone: "Europe/Stockholm",
});

const NUMBER = new Intl.NumberFormat("sv-SE");

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "–";
  return DATE_TIME.format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  return DATE.format(new Date(value));
}

/**
 * En återkomst eller ett möte: datum, och klockslaget bara när det finns. En
 * återkomst utan tid lagras som lokal midnatt, och "00:00" vore ett löfte
 * ingen gav.
 */
export function formatAppointment(value: string | null | undefined, hasTime: boolean): string {
  return hasTime ? formatDateTime(value) : formatDate(value);
}

/**
 * Gränserna för dagen i Stockholm, som ISO-strängar -- "förfallna och i dag"
 * mäts mot dem. Servern kör i UTC, så dagen kan inte tas från `new Date()`
 * rakt av.
 */
export function startOfTodayStockholm(now: Date = new Date()): string {
  return stockholmMoment(now, "00:00:00.000");
}

export function endOfTodayStockholm(now: Date = new Date()): string {
  return stockholmMoment(now, "23:59:59.999");
}

function stockholmMoment(now: Date, time: string): string {
  const day = DATE.format(now); // yyyy-mm-dd i sv-SE
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    timeZoneName: "longOffset",
  })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")
    ?.value.replace("GMT", "");
  return new Date(`${day}T${time}${offset || "Z"}`).toISOString();
}

export function formatNumber(value: number | null | undefined): string {
  return NUMBER.format(value ?? 0);
}

/** "för 3 minuter sedan". Relative time is what "last scraped" is really asking. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "aldrig";

  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return "nyss";
  if (minutes < 60) return `för ${minutes} min sedan`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `för ${hours} tim sedan`;

  const days = Math.round(hours / 24);
  if (days < 30) return `för ${days} ${days === 1 ? "dag" : "dagar"} sedan`;

  return formatDateTime(value);
}

/** Duration between two timestamps, for a run history row. */
export function formatDuration(from: string | null, to: string | null): string {
  if (!from || !to) return "–";
  const seconds = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/**
 * Stockholm's calendar date for a moment, as yyyy-mm-dd. The key a call is
 * bucketed under on the home screen's week chart.
 */
export function stockholmDay(value: Date | string): string {
  return DATE.format(typeof value === "string" ? new Date(value) : value);
}

/**
 * A calendar date `days` before (negative) or after `day`, as yyyy-mm-dd.
 *
 * CALENDAR ARITHMETIC, NOT MILLISECONDS. Subtracting 24 h from a moment skips
 * a date across the spring DST switch (that Sunday is 23 hours long), so the
 * date is shifted as a date: read at UTC noon, moved in UTC, printed back.
 */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The first moment of a Stockholm calendar date, as an ISO string. */
export function startOfDayStockholm(day: string): string {
  return startOfTodayStockholm(new Date(`${day}T12:00:00Z`));
}

const WEEKDAY_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"] as const;

/** "Mån" for a yyyy-mm-dd date. */
export function weekdayShort(day: string): string {
  return WEEKDAY_SHORT[new Date(`${day}T12:00:00Z`).getUTCDay()];
}

const HOUR = new Intl.DateTimeFormat("sv-SE", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "Europe/Stockholm",
});

/** "God morgon" / "God eftermiddag" / "God kväll", by the clock in Stockholm. */
export function greeting(now: Date = new Date()): string {
  const hour = Number.parseInt(HOUR.format(now), 10);
  if (hour >= 5 && hour < 12) return "God morgon";
  if (hour >= 12 && hour < 18) return "God eftermiddag";
  return "God kväll";
}

const LONG_DATE = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Stockholm",
});

/** "Onsdag 16 september". */
export function formatLongDate(now: Date = new Date()): string {
  const text = LONG_DATE.format(now);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function emailParts(email: string): string[] {
  return (email.split("@")[0] ?? "").split(/[._\-+]/).filter(Boolean);
}

/**
 * "Lucas" for lucas.persson@… -- the only name this app knows is the address,
 * so the greeting takes the part before the first separator. Null when there
 * is nothing that reads as a name.
 */
export function firstNameFromEmail(email: string): string | null {
  const first = emailParts(email)[0];
  if (!first || /\d/.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** "LP" for lucas.persson@…, "L" for lucas@… -- the avatar's initials. */
export function initialsFromEmail(email: string): string {
  const parts = emailParts(email);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return letters.join("") || "?";
}
