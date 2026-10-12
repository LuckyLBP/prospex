import { describe, expect, it } from "vitest";
import { cardProfile, MAX_CARD_PEOPLE } from "./card-profile";

const row = (over = {}) => ({ id: "p1", status: "done", stage: null, finished_at: "2026-10-12T10:00:00.000Z", summary: "Ett byggbolag.", people: [], figures: null, ...over });

describe("cardProfile", () => {
  it("keeps only what Ringläge shows", () => {
    const c = cardProfile(row({ figures: { revenue: 274235525, profit: 5, employees: 60, equity: 1, periodEnd: "2025-12-31" } }));
    expect(c).toMatchObject({ id: "p1", status: "done", stageLabel: null, finishedAt: "2026-10-12T10:00:00.000Z", summary: "Ett byggbolag.", people: [], figures: { revenue: 274235525, profit: 5, employees: 60, year: "2025" } });
    expect(c).toMatchObject({ growth: null, founded: null, talkingPoints: [], rating: null, jobs: null, offering: [], audience: null, tech: [], hours: [], address: null, mapsUrl: null, social: [], builtBy: null });
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

describe("cardProfile: the extended part", () => {
  const extra = {
    talkingPoints: [{ text: "Rekryterar tre undersköterskor.", evidence: ["F3"] }, { text: "  " }, { text: "Använder inget bokningsverktyg." }, { text: "c" }, { text: "d" }, { text: "e" }],
    offering: [{ text: "Hemtjänst i Stockholm." }, { text: "Larm." }],
    audience: { text: "Kommuner och privatpersoner." },
    services: [{ name: "WordPress", category: "plattform" }, { name: "wordpress", category: "plattform" }, { name: "Google Analytics", category: "analys" }],
    place: { rating: 4.6, ratingCount: 118, hours: ["måndag: 08:00–17:00", "tisdag: 08:00–17:00"], address: "Storgatan 1, Stockholm", mapsUrl: "https://maps.google.com/?cid=1" },
    address: null,
    jobs: { total: 7, ads: [{ title: "Undersköterska", city: "Stockholm", url: "https://arbetsformedlingen.se/1" }, { title: "Bad", city: null, url: "javascript:alert(1)" }] },
    social: [{ network: "facebook", url: "https://facebook.com/x" }, { network: "instagram", url: "data:text/html,boom" }],
    org: { registeredAt: "2012-05-01" },
    creator: { name: "Webbyrån AB" },
  };
  const c = cardProfile(row({ extra, figures: { revenue: 1100000, previous: { revenue: 1000000 }, profit: 1, employees: 12 } }));

  it("maps talking points, offering, audience, rating, hours, address and who built the site", () => {
    expect(c.talkingPoints).toEqual(["Rekryterar tre undersköterskor.", "Använder inget bokningsverktyg.", "c", "d"]);
    expect(c.offering).toEqual(["Hemtjänst i Stockholm.", "Larm."]);
    expect(c.audience).toBe("Kommuner och privatpersoner.");
    expect(c.rating).toEqual({ value: 4.6, count: 118 });
    expect(c.hours).toHaveLength(2);
    expect(c).toMatchObject({ address: "Storgatan 1, Stockholm", mapsUrl: "https://maps.google.com/?cid=1", builtBy: "Webbyrån AB", founded: 2012 });
  });
  it("calculates growth against the year before, and tolerates it missing", () => {
    expect(c.growth).toBe(10);
    expect(cardProfile(row({ figures: { revenue: 5, previous: { revenue: 0 } } })).growth).toBeNull();
    expect(cardProfile(row({ figures: { revenue: 900, previous: { revenue: 1000 } } })).growth).toBe(-10);
  });
  it("de-duplicates technologies and keeps only web addresses that are http or https", () => {
    expect(c.tech).toEqual([{ name: "WordPress", category: "plattform" }, { name: "Google Analytics", category: "analys" }]);
    expect(c.jobs).toEqual({ total: 7, ads: [{ title: "Undersköterska", city: "Stockholm", url: "https://arbetsformedlingen.se/1" }] });
    expect(c.social).toEqual([{ network: "facebook", url: "https://facebook.com/x" }]);
  });
  it("copes with an old profile that has none of it", () => {
    expect(cardProfile(row({ extra: { jobs: { total: 0, ads: [] }, services: "x", place: "y" } }))).toMatchObject({ jobs: null, tech: [], rating: null, talkingPoints: [] });
  });
});

