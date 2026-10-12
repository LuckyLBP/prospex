import { describe, expect, it } from "vitest";
import {
  deriveStatus,
  getTriggerState,
  isActive,
  isStale,
  progressLabel,
  STALE_AFTER_MS,
  type RunLike,
} from "./status";

const NOW = new Date("2026-09-10T12:00:00Z");

function run(overrides: Partial<RunLike> = {}): RunLike {
  return {
    status: "running",
    stage: "collect",
    created_at: NOW.toISOString(),
    heartbeat_at: NOW.toISOString(),
    enrich_total: 0,
    enriched_count: 0,
    records_found: 0,
    ...overrides,
  };
}

describe("isStale", () => {
  it("counts from the heartbeat when there is one", () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000).toISOString();
    expect(isStale({ created_at: NOW.toISOString(), heartbeat_at: old }, NOW)).toBe(true);
  });

  it("falls back to created_at for a run that never started", () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000).toISOString();
    expect(isStale({ created_at: old, heartbeat_at: null }, NOW)).toBe(true);
    expect(isStale({ created_at: NOW.toISOString(), heartbeat_at: null }, NOW)).toBe(false);
  });

  it("is not stale exactly at the threshold", () => {
    const edge = new Date(NOW.getTime() - STALE_AFTER_MS).toISOString();
    expect(isStale({ created_at: edge, heartbeat_at: edge }, NOW)).toBe(false);
  });
});

describe("isActive", () => {
  it("blocks a new run only while a live one holds the profile", () => {
    expect(isActive(run({ status: "queued" }), NOW)).toBe(true);
    expect(isActive(run({ status: "running" }), NOW)).toBe(true);
    expect(isActive(run({ status: "success" }), NOW)).toBe(false);
    expect(isActive(run({ status: "error" }), NOW)).toBe(false);
  });

  it("releases a profile whose worker went silent", () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1).toISOString();
    expect(isActive(run({ status: "running", heartbeat_at: old }), NOW)).toBe(false);
  });
});

describe("deriveStatus", () => {
  it("reports a profile that has never run", () => {
    expect(deriveStatus(null, NOW)).toBe("never");
  });

  it("maps finished runs to their outcome", () => {
    expect(deriveStatus(run({ status: "success" }), NOW)).toBe("idle");
    expect(deriveStatus(run({ status: "error" }), NOW)).toBe("error");
  });

  it("shows a silent worker as an error, not as still running", () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1).toISOString();
    expect(deriveStatus(run({ status: "running", heartbeat_at: old }), NOW)).toBe("error");
    expect(deriveStatus(run({ status: "running" }), NOW)).toBe("running");
  });
});

describe("progressLabel", () => {
  it("counts enrichment once that stage is reached", () => {
    expect(progressLabel(run({ stage: "enrich", enrich_total: 900, enriched_count: 120 }))).toBe(
      "Berikar 120 av 900",
    );
  });

  it("counts findings during collection", () => {
    expect(progressLabel(run({ records_found: 2400 }))).toBe("Samlar in… 2400 hittade");
  });

  it("says something before the first batch lands", () => {
    expect(progressLabel(run())).toBe("Startar…");
  });
});

describe("getTriggerState", () => {
  it("lets an administrator start a run when nothing is running", () => {
    expect(getTriggerState({ status: "idle" })).toEqual({ disabled: false, reason: null });
    expect(getTriggerState({ status: "error" })).toEqual({ disabled: false, reason: null });
    expect(getTriggerState({ status: "never" })).toEqual({ disabled: false, reason: null });
  });

  it("blocks a second run while one is in progress, and says so", () => {
    // Not a policy: two workers on one run would double every counter.
    expect(getTriggerState({ status: "running" })).toEqual({ disabled: true, reason: "Körning pågår" });
  });
});
