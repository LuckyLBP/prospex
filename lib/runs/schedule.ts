import { stockholmDay } from "@/lib/format";

/**
 * Veckouppdateringen: vilka källor som står på tur i dag.
 *
 * Säljarna startar inga körningar. Varje publicerad källa hämtas i stället om
 * en gång i veckan av /api/cron/refresh, PublicWWW inräknat (sedan
 * 2026-10-05; tidigare kördes PublicWWW bara för hand för att spara kvot).
 *
 * SPRITT ÖVER VECKAN, INTE ALLT PÅ EN DAG. Cronjobbet går varje dag och startar
 * som mest MAX_PER_DAY källor, de som väntat längst först. En källa är "på tur"
 * när ingen körning startats för den på en vecka. Resultatet blir samma takt
 * -- en gång i veckan per källa -- men utan att ett fyrtiotal körningar slåss
 * om samma minuter, och en dag då cronjobbet inte gick tas igen nästa dag.
 */

export const REFRESH_INTERVAL_DAYS = 7;

/**
 * Google Places hämtas i stället var 30:e dag. Varje sida är ett anrop mot en
 * gratiskvot på ungefär tusen i månaden, och en lista med orter och söktermer
 * kostar hundratals; varje vecka hade tömt den på två veckor.
 */
export const GOOGLEPLACES_REFRESH_INTERVAL_DAYS = 30;

/** Dygn mellan två hämtningar av en källa, efter metod. */
function intervalDays(method?: string): number {
  return method === "googleplaces" ? GOOGLEPLACES_REFRESH_INTERVAL_DAYS : REFRESH_INTERVAL_DAYS;
}

/** Tolerans mot cronjobbets tidsspridning, se DUE_AFTER_MS. */
function dueAfterMs(method?: string): number {
  return (intervalDays(method) - 0.5) * 24 * 60 * 60 * 1000;
}

/**
 * Så många körningar startar ett cronanrop som mest. Fyrtio källor i veckan
 * är knappt sex om dagen; tio ger utrymme att ta igen en missad dag.
 */
export const MAX_PER_DAY = 10;

/**
 * Så många av dem som får vara PublicWWW. API:et släpper igenom två anrop per
 * trettio sekunder och kollektorn försöker som mest fyra gånger, så fler som
 * startar i samma minut hade fått ge upp. Fyra om dagen är 28 i veckan.
 */
export const MAX_PUBLICWWW_PER_DAY = 4;

/** När cronjobbet går, i UTC (vercel.json: "0 4 * * *"). */
const CRON_HOUR_UTC = 4;

/**
 * Tolerans mot cronjobbets egen tidsspridning: Vercel startar ett dagligt jobb
 * någon gång inom timmen, så "sju dygn sedan" kan vara sex dygn och 23 timmar.
 */
type Method = "publicwww" | "viewdns" | "script" | "domainlist" | "googleplaces" | "agency";

export interface ScheduleCandidate {
  profileId: string;
  method: Method;
  published: boolean;
  /** När den senaste körningen STARTADES, oavsett sort och hur den gick. */
  lastCollectAt: string | null;
}

/**
 * Källorna som ska hämtas nu, den som väntat längst först.
 *
 * Räknar från senaste START och inte senaste lyckade körning: en källa som
 * misslyckas ska försöka igen nästa vecka, inte varje dag och inte för evigt.
 */
export function pickDueProfiles(
  candidates: readonly ScheduleCandidate[],
  now: Date = new Date(),
  limit: number = MAX_PER_DAY,
  publicwwwLimit: number = MAX_PUBLICWWW_PER_DAY,
): ScheduleCandidate[] {
  const due = candidates
    .filter((profile) => profile.published)
    .filter(
      (profile) =>
        profile.lastCollectAt === null ||
        now.getTime() - new Date(profile.lastCollectAt).getTime() >= dueAfterMs(profile.method),
    )
    .sort((a, b) => (a.lastCollectAt ?? "").localeCompare(b.lastCollectAt ?? ""));

  const picked: ScheduleCandidate[] = [];
  let publicwww = 0;
  for (const profile of due) {
    if (picked.length >= limit) break;
    // En byrå gör också ett PublicWWW-anrop, så den räknas mot samma dagstak.
    if (profile.method === "publicwww" || profile.method === "agency") {
      if (publicwww >= publicwwwLimit) continue;
      publicwww++;
    }
    picked.push(profile);
  }
  return picked;
}

/**
 * Ungefär när källan hämtas nästa gång: första cronkörningen efter att den
 * blivit på tur. Ungefär, eftersom en dag med fler på tur än MAX_PER_DAY
 * skjuter de sista en dag -- men en källa vars datum redan passerat syns
 * direkt som försenad, vilket är vad visningen är till för.
 */
export function nextRefreshAt(lastCollectAt: string | null, now: Date = new Date(), method?: string): Date {
  const dueAt = lastCollectAt ? new Date(new Date(lastCollectAt).getTime() + dueAfterMs(method)) : now;
  const from = dueAt > now ? dueAt : now;
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), CRON_HOUR_UTC));
  if (next < from) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** En källa som inte hämtats på så här länge har fastnat -- schemat går inte. */
function lateAfterMs(method?: string): number {
  return (intervalDays(method) + 1) * 24 * 60 * 60 * 1000;
}

export interface RefreshSchedule {
  /** "i dag", "i morgon", "om 3 dagar". */
  label: string;
  /** Senaste körningen är mer än åtta dygn gammal: schemat har stannat. */
  late: boolean;
}

/** Nästa automatiska hämtning, som en administratör läser den. */
export function describeNextRefresh(
  lastCollectAt: string | null,
  now: Date = new Date(),
  method?: string,
): RefreshSchedule {
  const next = nextRefreshAt(lastCollectAt, now, method);
  const days = Math.round(
    (Date.parse(`${stockholmDay(next)}T00:00:00Z`) - Date.parse(`${stockholmDay(now)}T00:00:00Z`)) / 86_400_000,
  );
  const label = days <= 0 ? "i dag" : days === 1 ? "i morgon" : `om ${days} dagar`;
  const late = lastCollectAt !== null && now.getTime() - new Date(lastCollectAt).getTime() > lateAfterMs(method);
  return { label, late };
}
