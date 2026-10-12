import { describe, expect, it } from "vitest";
import { describeNextRefresh, nextRefreshAt, pickDueProfiles, type ScheduleCandidate } from "./schedule";

const now = new Date("2026-09-16T04:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

function candidate(overrides: Partial<ScheduleCandidate> & { profileId: string }): ScheduleCandidate {
  return { method: "viewdns", published: true, lastCollectAt: null, ...overrides };
}

describe("pickDueProfiles and agencies", () => {
  it("counts an agency against the daily PublicWWW cap, since it makes a PublicWWW request", () => {
    const due = pickDueProfiles(
      [
        candidate({ profileId: "a1", method: "agency", lastCollectAt: daysAgo(20) }),
        candidate({ profileId: "p1", method: "publicwww", lastCollectAt: daysAgo(19) }),
        candidate({ profileId: "a2", method: "agency", lastCollectAt: daysAgo(18) }),
        candidate({ profileId: "v1", method: "viewdns", lastCollectAt: daysAgo(17) }),
      ],
      now,
      10,
      2,
    );
    expect(due.map((p) => p.profileId)).toEqual(["a1", "p1", "v1"]);
  });
});

describe("pickDueProfiles", () => {
  it("includes PublicWWW and skips unpublished profiles", () => {
    const due = pickDueProfiles(
      [
        candidate({ profileId: "pww", method: "publicwww" }),
        candidate({ profileId: "draft", published: false }),
        candidate({ profileId: "ok" }),
      ],
      now,
    );
    expect(due.map((p) => p.profileId)).toEqual(["pww", "ok"]);
  });

  it("caps PublicWWW per day and fills the rest with other sources", () => {
    const due = pickDueProfiles(
      [
        candidate({ profileId: "p1", method: "publicwww", lastCollectAt: daysAgo(20) }),
        candidate({ profileId: "p2", method: "publicwww", lastCollectAt: daysAgo(19) }),
        candidate({ profileId: "p3", method: "publicwww", lastCollectAt: daysAgo(18) }),
        candidate({ profileId: "v1", lastCollectAt: daysAgo(10) }),
      ],
      now,
      10,
      2,
    );
    expect(due.map((p) => p.profileId)).toEqual(["p1", "p2", "v1"]);
  });

  it("waits a week after the last collect, with half a day of slack", () => {
    const due = pickDueProfiles(
      [
        candidate({ profileId: "fresh", lastCollectAt: daysAgo(3) }),
        candidate({ profileId: "almost", lastCollectAt: daysAgo(6.6) }),
        candidate({ profileId: "stale", lastCollectAt: daysAgo(8) }),
      ],
      now,
    );
    expect(due.map((p) => p.profileId)).toEqual(["stale", "almost"]);
  });

  it("takes never-run profiles first, then the longest-waiting, up to the limit", () => {
    const due = pickDueProfiles(
      [
        candidate({ profileId: "b", lastCollectAt: daysAgo(9) }),
        candidate({ profileId: "a", lastCollectAt: daysAgo(20) }),
        candidate({ profileId: "never" }),
      ],
      now,
      2,
    );
    expect(due.map((p) => p.profileId)).toEqual(["never", "a"]);
  });
});

describe("nextRefreshAt", () => {
  it("is the first cron run after the source is due", () => {
    // Last run 14 Sept 10:00 UTC → due 6.5 days later (20 Sept 22:00) → 21 Sept 04:00 UTC.
    expect(nextRefreshAt("2026-09-14T10:00:00Z", now).toISOString()).toBe("2026-09-21T04:00:00.000Z");
  });

  it("is the next cron run when the source is already due", () => {
    expect(nextRefreshAt(daysAgo(10), now).toISOString()).toBe("2026-09-16T04:00:00.000Z");
    expect(nextRefreshAt(null, new Date("2026-09-16T05:00:00Z")).toISOString()).toBe("2026-09-17T04:00:00.000Z");
  });
});

describe("describeNextRefresh", () => {
  it("says when, in words", () => {
    const at = new Date("2026-09-16T08:00:00Z");
    expect(describeNextRefresh(daysAgo(1), at)).toEqual({ label: "om 6 dagar", late: false });
    expect(describeNextRefresh("2026-09-10T03:00:00Z", at)).toEqual({ label: "i morgon", late: false });
  });

  it("flags a source the schedule has not touched for over eight days", () => {
    expect(describeNextRefresh(daysAgo(25), now).late).toBe(true);
    expect(describeNextRefresh(null, now).late).toBe(false);
  });
});

describe("per-method interval", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it("keeps Google Places out of the weekly round until a month has passed", () => {
    const candidate = (lastCollectAt: string) => ({
      profileId: "p",
      method: "googleplaces" as const,
      published: true,
      lastCollectAt,
    });
    expect(pickDueProfiles([candidate(daysAgo(10))], now)).toEqual([]);
    expect(pickDueProfiles([candidate(daysAgo(30))], now)).toHaveLength(1);
  });

  it("shows the monthly date and only calls it late after 31 days", () => {
    expect(describeNextRefresh(daysAgo(10), now, "googleplaces").late).toBe(false);
    expect(describeNextRefresh(daysAgo(25), now, "googleplaces").late).toBe(false);
    expect(describeNextRefresh(daysAgo(25), now).late).toBe(true);
    expect(describeNextRefresh(daysAgo(32), now, "googleplaces").late).toBe(true);
  });
});
