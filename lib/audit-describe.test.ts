import { describe, expect, it } from "vitest";
import { actorName, changedFields, describeAudit, diff, groupPrefixes } from "./audit-describe";

const row = (action: string, details: Record<string, unknown> | null = null, name: string | null = "X") => ({ action, actor_email: "lucas@pohlare.com", entity_name: name, details });

describe("describeAudit", () => {
  it("writes Swedish sentences with the actor's first name", () => {
    expect(describeAudit(row("org.create", null, "Effektiv Media"))).toBe("Lucas skapade bolaget Effektiv Media");
    expect(describeAudit(row("org.deactivate", null, "Test AB"))).toBe("Lucas stängde av bolaget Test AB");
  });
  it("describes role changes with both roles", () => {
    expect(describeAudit(row("member.role", { email: "anna@x.se", org: "Test AB", from: "member", to: "owner" }))).toBe("Lucas ändrade rollen för anna@x.se i Test AB från medlem till ägare");
  });
  it("describes invitations and removals", () => {
    expect(describeAudit(row("member.invite", { email: "a@x.se", org: "T", role: "member" }))).toBe("Lucas bjöd in a@x.se till T som medlem");
    expect(describeAudit(row("member.remove", { email: "a@x.se", org: "T" }))).toBe("Lucas tog bort a@x.se från T");
    expect(describeAudit(row("invite.cancel", { email: "a@x.se" }))).toBe("Lucas avbröt inbjudan till a@x.se");
  });
  it("names the kind of source and lists changed fields", () => {
    expect(describeAudit(row("source.publish", { kind: "list" }, "Redovisningsbyråer"))).toBe("Lucas publicerade listan Redovisningsbyråer");
    expect(describeAudit(row("source.unpublish", { kind: "supplier" }, "ROI"))).toBe("Lucas avpublicerade leverantören ROI");
    expect(describeAudit(row("source.update", { kind: "list", changes: { name: ["a", "b"], config: [null, {}], description: ["", "x"] } }, "Frisörer"))).toBe("Lucas ändrade listan Frisörer (namn, sökinställningar och beskrivning)");
  });
  it("describes logo changes both ways", () => {
    expect(describeAudit(row("source.logo", {}, "Wix"))).toBe("Lucas bytte logotyp för Wix");
    expect(describeAudit(row("source.logo", { removed: true }, "Wix"))).toBe("Lucas tog bort logotypen för Wix");
  });
  it("describes runs", () => {
    expect(describeAudit(row("run.start", { kind: "list" }, "Frisörer"))).toBe("Lucas startade en körning för listan Frisörer");
    expect(describeAudit(row("run.cancel", { kind: "supplier" }, "ROI"))).toBe("Lucas avbröt körningen för leverantören ROI");
    expect(describeAudit(row("run.requeue", { kind: "supplier", count: 12 }, "Wix"))).toBe("Lucas lät leverantören Wix läsa om misslyckade webbplatser (12)");
  });
  it("describes company profiles", () => {
    expect(describeAudit(row("profile.create", { input: "foretag.se" }, "Företaget AB"))).toBe("Lucas gjorde en spaning på Företaget AB");
    expect(describeAudit(row("org.profile_access_on", null, "Test AB"))).toBe("Lucas öppnade Spaning för bolaget Test AB");
    expect(describeAudit(row("org.profile_access_off", null, "Test AB"))).toBe("Lucas stängde Spaning för bolaget Test AB");
    expect(describeAudit(row("profile.refresh", null, "Företaget AB"))).toBe("Lucas uppdaterade spaningen på Företaget AB");
  });
  it("describes an automatic publish", () => {
    expect(describeAudit({ ...row("source.autopublish", { kind: "supplier", customers: 12 }, "Leads"), actor_email: "system" })).toBe("System publicerade leverantören Leads automatiskt efter ett önskemål (12 kunder)");
  });
  it("describes list access", () => {
    expect(describeAudit(row("org.list_access_on", null, "Test AB"))).toBe("Lucas öppnade fullständig bläddring i listorna för bolaget Test AB");
    expect(describeAudit(row("org.list_access_off", null, "Test AB"))).toBe("Lucas stängde fullständig bläddring i listorna för bolaget Test AB");
  });
  it("falls back to something readable for an unknown action", () => {
    expect(describeAudit(row("thing.happened", null, "Y"))).toBe("Lucas utförde thing.happened på Y");
  });
  it("never uses a dash in its sentences", () => {
    const actions = ["org.create", "member.role", "source.update", "category.delete", "user.admin_grant"];
    expect(actions.map((a) => describeAudit(row(a, { email: "a@x.se", from: "member", to: "owner" }))).join(" ")).not.toMatch(/[–—]/);
  });
});

describe("actorName", () => {
  it("takes the first word of the address", () => {
    expect(actorName("lucas.pohl@x.se")).toBe("Lucas");
    expect(actorName("ANNA@x.se")).toBe("Anna");
  });
});

describe("diff", () => {
  const before = { name: "A", description: null as string | null, sort: 1, published: true };
  it("returns only what changed, as [before, after]", () => {
    expect(diff(before, { name: "B", sort: 1, published: false }, ["name", "description", "sort", "published"])).toEqual({ name: ["A", "B"], published: [true, false] });
  });
  it("treats null and undefined as the same, and ignores fields not given", () => {
    expect(diff(before, { description: undefined }, ["description"])).toEqual({});
  });
  it("is empty when nothing changed", () => {
    expect(diff(before, { name: "A" }, ["name"])).toEqual({});
  });
  it("compares objects by content", () => {
    expect(diff({ c: { a: 1 } }, { c: { a: 1 } }, ["c"])).toEqual({});
    expect(diff({ c: { a: 1 } }, { c: { a: 2 } }, ["c"])).toEqual({ c: [{ a: 1 }, { a: 2 }] });
  });
});

describe("filters", () => {
  it("maps a group to its prefixes", () => {
    expect(groupPrefixes("katalog")).toEqual(["source.", "category.", "run.", "profile."]);
    expect(groupPrefixes("nope")).toBeNull();
  });
  it("names the fields that changed", () => {
    expect(changedFields({ changes: { name: [1, 2], names_brand: [false, true] } })).toEqual(["namn", "namnger varumärken"]);
    expect(changedFields(null)).toEqual([]);
  });
});
