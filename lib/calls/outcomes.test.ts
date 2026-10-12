import { describe, expect, it } from "vitest";
import { OUTCOME_GROUPS, OUTCOMES, outcomeAliases, outcomeInfo, outcomeLabel } from "./outcomes";

describe("OUTCOMES", () => {
  it("has a unique digit key per outcome, 1 through 9 and 0", () => {
    const keys = OUTCOMES.map((o) => o.key);
    expect(new Set(keys).size).toBe(OUTCOMES.length);
    expect([...keys].sort()).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("has a unique value per outcome", () => {
    const values = OUTCOMES.map((o) => o.value);
    expect(new Set(values).size).toBe(OUTCOMES.length);
  });

  it("lists the groups in order, so the keys run left to right through them", () => {
    const groups = OUTCOMES.map((o) => o.group);
    const order = OUTCOME_GROUPS.map((g) => g.value);
    expect([...groups].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(groups);
  });

  it("marks the natural end-states as terminal", () => {
    const terminal = OUTCOMES.filter((o) => o.terminal).map((o) => o.value).sort();
    expect(terminal).toEqual([
      "customer",
      "existing_customer",
      "not_interested",
      "not_relevant",
      "skip_number",
      "wrong_number",
    ]);
  });

  it("offers a callback date only on the three outcomes that leave the record in the queue", () => {
    const withCallback = OUTCOMES.filter((o) => o.callback).map((o) => o.value).sort();
    expect(withCallback).toEqual(["busy", "callback", "no_answer"]);
  });

  it("asks for a meeting time only on 'Möte bokat'", () => {
    expect(OUTCOMES.filter((o) => o.meeting).map((o) => o.value)).toEqual(["meeting_booked"]);
  });
});

describe("outcomeInfo", () => {
  it("finds every offered value", () => {
    for (const outcome of OUTCOMES) {
      expect(outcomeInfo(outcome.value).value).toBe(outcome.value);
    }
  });

  it("shows the retired values as what they were used for", () => {
    expect(outcomeLabel("not_customer")).toBe("Kasta – inte aktuell");
    expect(outcomeLabel("no_website")).toBe("Kasta – inte aktuell");
  });
});

describe("outcomeLabel", () => {
  it("says 'Inte ringd' for null", () => {
    expect(outcomeLabel(null)).toBe("Inte ringd");
  });

  it("calls a sale a sale", () => {
    expect(outcomeLabel("customer")).toBe("Såld – blev kund");
  });
});

describe("outcomeAliases", () => {
  it("includes the retired values when filtering on 'Kasta'", () => {
    expect(outcomeAliases("not_relevant").sort()).toEqual(["no_website", "not_customer", "not_relevant"]);
    expect(outcomeAliases("customer")).toEqual(["customer"]);
  });
});
