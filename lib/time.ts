export const TZ = "Europe/Stockholm";

function offsetMs(date: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
}

/** "2026-10-12T10:00" tolkat som svensk lokal tid -> riktigt tidsögonblick. */
export function stockholmToUtc(local: string): Date {
  const [d, t = "00:00"] = local.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

/** "YYYY-MM-DD" för ett ögonblick, i svensk tid. */
export const dateKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Måndagen i veckan som `key` ligger i. */
export function mondayOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // mån = 0
  return addDays(key, -dow);
}

export function hourMinute(d: Date): { h: number; m: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { h: +p.hour, m: +p.minute };
}

export const startOfDayUtc = (key: string) => stockholmToUtc(`${key}T00:00`);

export const formatDateTime = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

export const formatDate = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(d);

export const formatTime = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

/** Värde för <input type="datetime-local"> i svensk tid. */
export function toLocalInput(d: Date): string {
  const { h, m } = hourMinute(d);
  return `${dateKey(d)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
