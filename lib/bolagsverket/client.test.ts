import { describe, expect, it } from "vitest";
import aktiebolag from "./fixtures/organisationer-aktiebolag.json";
import { toIdentity } from "./client";
import { mapOrganisation } from "./map";
import { summariseRegistry } from "./summary";

describe("toIdentity", () => {
  it("sends ten digits, whatever was stored", () => {
    expect(toIdentity("556677-8899")).toBe("5566778899");
    expect(toIdentity("165566778899")).toBe("5566778899");
    expect(toIdentity("12345")).toBeNull();
  });
});

describe("summariseRegistry", () => {
  it("summarises what the stored data says without opening the card", () => {
    const organisation = mapOrganisation(aktiebolag, "5299999994");
    expect(
      summariseRegistry({ version: 1, organisation, organisationFetchedAt: "2026-09-16T10:00:00Z" }),
    ).toEqual({
      legalForm: "Aktiebolag",
      sni: "Specialiserad butikshandel med cyklar",
      status: { kind: "deregistered", date: "2023-05-05", reason: "Likvidation" },
    });
  });

  it("is null for nothing, an unknown number, or a foreign shape", () => {
    expect(summariseRegistry(null)).toBeNull();
    expect(summariseRegistry({ version: 1, organisation: null, organisationFetchedAt: "x" })).toBeNull();
    expect(summariseRegistry({ something: "else" })).toBeNull();
  });
});
