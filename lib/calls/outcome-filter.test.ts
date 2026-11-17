import { describe, expect, it } from "vitest";
import { OUTCOME_FILTER_OPTIONS, outcomeCondition, parseOutcomeFilter } from "./outcome-filter";

describe("parseOutcomeFilter", () => {
  it("lets through the special filters and every real outcome, and nothing else", () => {
    expect(parseOutcomeFilter("att-ringa")).toBe("att-ringa");
    expect(parseOutcomeFilter("ej-ringd")).toBe("ej-ringd");
    expect(parseOutcomeFilter("ej-svar")).toBe("ej-svar");
    expect(parseOutcomeFilter("busy")).toBe("busy");
    expect(parseOutcomeFilter("")).toBeUndefined();
    expect(parseOutcomeFilter(undefined)).toBeUndefined();
    expect(parseOutcomeFilter("x'; drop table contacts; --")).toBeUndefined();
  });
});

describe("outcomeCondition", () => {
  it("not called means no logged outcome, no answer means no_answer, and the combined one is either", () => {
    expect(outcomeCondition("ej-ringd", 3)).toEqual({ sql: "k.outcome is null", args: [] });
    expect(outcomeCondition("ej-svar", 3)).toEqual({ sql: "k.outcome = 'no_answer'", args: [] });
    expect(outcomeCondition("att-ringa", 3)).toEqual({ sql: "(k.outcome is null or k.outcome = 'no_answer')", args: [] });
  });
  it("binds a specific outcome as a parameter at the given position", () => {
    expect(outcomeCondition("busy", 4)).toEqual({ sql: "k.outcome = $4", args: ["busy"] });
  });
  it("counts the old throw away values together with Kasta", () => {
    expect(outcomeCondition("not_relevant", 2)?.sql).toContain("'not_customer'");
  });
  it("gives nothing for an invalid or empty value", () => {
    expect(outcomeCondition("nonsense", 1)).toBeNull();
    expect(outcomeCondition(undefined, 1)).toBeNull();
  });
});

describe("OUTCOME_FILTER_OPTIONS", () => {
  it("starts with all, then the quick filters, and offers each other outcome once", () => {
    expect(OUTCOME_FILTER_OPTIONS.slice(0, 4).map((o) => o.value)).toEqual(["", "att-ringa", "ej-ringd", "ej-svar"]);
    const values = OUTCOME_FILTER_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain("busy");
    expect(values.filter((v) => v === "no_answer")).toHaveLength(0);
  });
});
