import { describe, expect, it } from "vitest";
import { cardProfile, MAX_CARD_PEOPLE } from "./card-profile";

const row = (over = {}) => ({ id: "p1", status: "done", stage: null, finished_at: "2026-10-12T10:00:00.000Z", summary: "Ett byggbolag.", people: [], figures: null, ...over });

describe("cardProfile", () => {
  it("keeps only what Ringläge shows", () => {
    const c = cardProfile(row({ figures: { revenue: 274235525, profit: 5, employees: 60, equity: 1, periodEnd: "2025-12-31" } }));
    expect(c).toEqual({ id: "p1", status: "done", stageLabel: null, finishedAt: "2026-10-12T10:00:00.000Z", summary: "Ett byggbolag.", people: [], figures: { revenue: 274235525, profit: 5, employees: 60, year: "2025" } });
  });
  it("lists people with a number first, adds signed photo links, and caps the list", () => {
    const people = [
      { name: "Anna Berg", role: "VD", email: "anna@x.se", phone: null, photoPath: "c1/a.webp" },
      { name: "Bo Ek", role: null, email: null, phone: "+46701234567", photoPath: "c1/b.webp" },
      ...Array.from({ length: 8 }, (_, i) => ({ name: `Person Nr${i}`, role: null, email: null, phone: null })),
      { role: "Utan namn" },
    ];
    const c = cardProfile(row({ people }), new Map([["c1/b.webp", "https://signed/b"]]));
    expect(c.people).toHaveLength(MAX_CARD_PEOPLE);
    expect(c.people[0]).toMatchObject({ name: "Bo Ek", phone: "+46701234567", photoUrl: "https://signed/b", key: "bo ek" });
    expect(c.people[1]).toMatchObject({ name: "Anna Berg", photoUrl: null });
  });
  it("gives no figures when none exist, and handles odd input", () => {
    expect(cardProfile(row({ figures: { revenue: null, profit: null, employees: null } })).figures).toBeNull();
    expect(cardProfile(row({ people: "x", figures: "y", status: "weird", summary: "  " }))).toMatchObject({ status: "error", people: [], figures: null, summary: null });
  });
  it("names the stage of a running scan", () => {
    expect(cardProfile(row({ status: "running", stage: "website", finished_at: null }))).toMatchObject({ status: "running", stageLabel: "Läser webbplatsen", finishedAt: null });
  });
});
