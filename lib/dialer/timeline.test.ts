import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

const log = (calledAt: string) => ({ outcome: "no_answer" as const, note: null, calledAt, userEmail: "a@x.se", callbackAt: null, meetingAt: null });
const note = (id: string, createdAt: string) => ({ id, body: id, createdAt, userEmail: "b@x.se" });

describe("buildTimeline", () => {
  it("puts calls and notes in one thread, oldest first", () => {
    const t = buildTimeline([log("2026-10-02T10:00:00Z"), log("2026-10-04T10:00:00Z")], [note("n1", "2026-10-03T10:00:00Z")]);
    expect(t.map((i) => i.kind)).toEqual(["call", "note", "call"]);
  });
  it("does not mutate its inputs", () => {
    const logs = [log("2026-10-05T10:00:00Z"), log("2026-10-01T10:00:00Z")];
    buildTimeline(logs, []);
    expect(logs[0].calledAt).toBe("2026-10-05T10:00:00Z");
  });
  it("is empty for a company nobody has touched", () => {
    expect(buildTimeline([], [])).toEqual([]);
  });
});
