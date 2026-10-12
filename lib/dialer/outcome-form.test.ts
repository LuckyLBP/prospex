import { describe, expect, it } from "vitest";
import { OUTCOMES } from "@/lib/calls/outcomes";
import { canSaveForm, EMPTY_FORM, menuChoice, withOutcome } from "./outcome-form";

describe("menuChoice", () => {
  it("saves every outcome straight away except those that need a meeting time", () => {
    const select = OUTCOMES.filter((o) => menuChoice(o.value) === "select").map((o) => o.value);
    expect(select).toEqual(OUTCOMES.filter((o) => o.meeting).map((o) => o.value));
    expect(select).toContain("meeting_booked");
    expect(menuChoice("no_answer")).toBe("save");
    expect(menuChoice("callback")).toBe("save");
    expect(menuChoice("customer")).toBe("save");
  });
});

describe("withOutcome", () => {
  it("keeps a callback date for outcomes that use one, and clears it for those that do not", () => {
    const f = { ...EMPTY_FORM, outcome: "callback" as const, cbDate: "2026-10-14", cbTime: "09:00" };
    expect(withOutcome(f, "no_answer")).toMatchObject({ outcome: "no_answer", cbDate: "2026-10-14", cbTime: "09:00", archive: false });
    expect(withOutcome(f, "wrong_number")).toMatchObject({ outcome: "wrong_number", cbDate: "", cbTime: "", archive: true });
  });
  it("proposes a meeting time for a meeting, and drops it again for other outcomes", () => {
    const m = withOutcome(EMPTY_FORM, "meeting_booked");
    expect(m.meeting).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(withOutcome(m, "no_answer").meeting).toBe("");
  });
});

describe("canSaveForm", () => {
  it("needs an outcome, and a valid time for a meeting", () => {
    expect(canSaveForm(EMPTY_FORM)).toBe(false);
    expect(canSaveForm({ ...EMPTY_FORM, outcome: "no_answer" })).toBe(true);
    expect(canSaveForm({ ...EMPTY_FORM, outcome: "meeting_booked", meeting: "" })).toBe(false);
    expect(canSaveForm({ ...EMPTY_FORM, outcome: "meeting_booked", meeting: "2026-10-14T10:00" })).toBe(true);
  });
});
