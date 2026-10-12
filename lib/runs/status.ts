/**
 * When a run stops counting as alive, and what the dashboard should say.
 *
 * A serverless invocation can vanish without getting to write anything: a
 * deploy lands mid-run, the platform kills the container, a process crashes.
 * The row is then left saying "running" forever, and nothing would ever clear
 * it. So a run's status is not the column alone -- it is the column plus how
 * long ago the worker last showed a sign of life.
 *
 * FIFTEEN MINUTES, and the number is shared on purpose: scrape_start_run uses
 * the same one to decide whether a profile is busy. If these two disagreed a
 * profile could look idle while its RPC still refused to start a run, which is
 * the kind of bug that reads as "the button does nothing".
 */
export const STALE_AFTER_MS = 15 * 60_000;

export type RunStatus = "queued" | "running" | "success" | "error";
export type DisplayStatus = "idle" | "running" | "error" | "never";

export interface RunLike {
  status: RunStatus;
  stage: string | null;
  created_at: string;
  heartbeat_at: string | null;
  enrich_total: number;
  enriched_count: number;
  records_found: number;
}

/** A run is stale when its worker has been silent past the threshold. */
export function isStale(run: Pick<RunLike, "created_at" | "heartbeat_at">, now: Date = new Date()): boolean {
  const last = new Date(run.heartbeat_at ?? run.created_at).getTime();
  return now.getTime() - last > STALE_AFTER_MS;
}

/** Does this run currently occupy its profile, blocking a new one? */
export function isActive(
  run: Pick<RunLike, "status" | "created_at" | "heartbeat_at">,
  now: Date = new Date(),
): boolean {
  if (run.status !== "queued" && run.status !== "running") return false;
  return !isStale(run, now);
}

/** What the dashboard shows for a profile whose latest run is `run`. */
export function deriveStatus(run: RunLike | null, now: Date = new Date()): DisplayStatus {
  if (!run) return "never";
  if (run.status === "success") return "idle";
  if (run.status === "error") return "error";
  // queued/running: alive is "running", silent for too long is a failure that
  // nobody was around to record.
  return isStale(run, now) ? "error" : "running";
}

/**
 * Vad administratörens profillista säger. "idle" betyder att senaste
 * körningen gick igenom och att ingen pågår -- därav "Klar", inte "Inaktiv",
 * som lät som att källan var avstängd. Säljarna ser inga statusord alls,
 * bara när källan senast uppdaterades (se SourceFreshness).
 */
export const STATUS_LABELS: Record<DisplayStatus, string> = {
  never: "Aldrig körd",
  idle: "Klar",
  running: "Körs",
  error: "Fel",
};

/** The one-line progress note under a running profile. */
export function progressLabel(run: RunLike): string {
  if (run.stage === "enrich" && run.enrich_total > 0) {
    return `Berikar ${run.enriched_count} av ${run.enrich_total}`;
  }
  if (run.records_found > 0) {
    return `Samlar in… ${run.records_found} hittade`;
  }
  return "Startar…";
}

/** The message a run that died without writing one should carry. */
export const STALE_ERROR = "Avbröts: ingen aktivitet på 15 minuter.";

export interface TriggerState {
  disabled: boolean;
  /** Why the button is disabled, shown next to it. null when it is enabled. */
  reason: string | null;
}

/**
 * Whether an administrator's "Kör nu" is offered, and if not, why.
 *
 * Only administrators ever see the button -- sellers get the weekly schedule
 * instead -- so the one rule left is the correctness one: two workers on one
 * run would double every counter, so nothing starts while a run is going.
 *
 * The reason is rendered as text rather than a tooltip: a disabled button with
 * a hidden explanation is a button that appears broken.
 */
export function getTriggerState(input: { status: DisplayStatus }): TriggerState {
  if (input.status === "running") return { disabled: true, reason: "Körning pågår" };
  return { disabled: false, reason: null };
}

/**
 * Om "Läs om misslyckade" får tryckas, och annars varför inte.
 *
 * Egen funktion och inte ett villkor i komponenten, av samma skäl som
 * getTriggerState: den är ren och därmed testbar, och en avstängd knapp ska
 * alltid kunna säga sitt skäl i text.
 *
 * Knappen startar en körning, så spärren mot parallella körningar gäller den
 * precis som "Kör nu".
 */
export function getRequeueState(input: {
  status: DisplayStatus;
  failedCount: number;
  isAdmin: boolean;
}): TriggerState {
  if (!input.isAdmin) {
    return { disabled: true, reason: "Endast administratörer" };
  }
  if (input.status === "running") {
    return { disabled: true, reason: "Körning pågår" };
  }
  if (input.failedCount <= 0) {
    return { disabled: true, reason: "Inga misslyckade poster" };
  }
  return { disabled: false, reason: null };
}
