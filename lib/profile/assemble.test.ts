import { describe, expect, it } from "vitest";
import { assembleProfile, cleanText, sentenceAllowed, type AssembleInput } from "./assemble";
import { PageBudget } from "./safe-fetch";
import type { Fact, ProfileModelOutput } from "./types";

const facts: Fact[] = [
  { id: "F1", kind: "page", label: "Startsidan hämtades", value: "https://x.se", source: "https://x.se", detector: "page:home" },
  { id: "F2", kind: "detector", label: "Meta-pixel", value: "finns på sidan", source: "https://x.se", detector: "meta" },
  { id: "F3", kind: "detector", label: "Mailchimp", value: "finns på sidan", source: "https://x.se", detector: "mailchimp" },
  { id: "F4", kind: "registry", label: "Omsättning", value: "12 345 000 kr", source: "Bolagsverket, årsredovisning", detector: "registry:omsättning" },
  { id: "F5", kind: "audit", label: "Webbplatsen anges vara gjord av", value: "Webbyrån AB", source: "https://x.se", detector: "credit" },
];
const texts = [{ id: "F1", url: "https://x.se", text: "Vi har installerat över 1200 värmepumpar sedan 2015. Priset börjar på 4 900 kr." }];

const model = (over: Partial<ProfileModelOutput> = {}): ProfileModelOutput => ({
  summary: "Ett elbolag i Skåne.", offering: [{ text: "Elinstallation och värmepumpar.", evidence: ["F1"] }], audience: { text: "Villaägare.", evidence: ["F1"] }, services: [], observations: [{ text: "Sajten har annonsspårning.", evidence: ["F2"] }], talkingPoints: [], ...over,
});

function input(over: Partial<AssembleInput> = {}): AssembleInput {
  return {
    resolved: { kind: "url", orgnr: "556503-8212", orgnrDisplay: "556503-8212", soleTrader: false, domain: "x.se", websiteSource: "input", websiteVerified: true, catalog: null, organisation: null, place: null, name: "X AB", city: null, warnings: ["Från resolve"] },
    gathered: {
      facts, registry: { status: "ok", message: null, organisation: { orgnr: "556503-8212", name: "X AB", legalForm: null, registeredAt: null, active: true, deregisteredAt: null, deregistrationReason: null, proceedings: [], description: null, sni: [], advertisingBlocked: null, address: { street: "Storgatan 1", postalCode: "211 11", city: "Malmö" } }, figures: { periodEnd: "2025-12-31", registeredAt: null, revenue: 12_345_000, profit: 1, employees: 9, equity: 1, totalAssets: 1, solidity: 40 }, figuresStatus: "ok" },
      site: { status: "ok", message: null, domain: "x.se", url: "https://x.se", audit: null, tech: [] }, marketingTech: [], social: [], inventory: [], creator: null, platformLinks: [], dns: [], contact: { phones: ["+4640123456"], emails: ["info@x.se"], companyName: null },
      pages: [], texts, peoplePages: [], orgnr: "556503-8212", websiteVerified: true, siteDomain: "x.se", warnings: ["Från gather"], boundary: "x.se", budget: new PageBudget(),
    },
    companyId: "c1", model: model(), texts, place: null, facts,
    meta: { model: "deepseek/deepseek-v4-flash", inputTokens: 1000, outputTokens: 200, steps: 1, toolPages: [], durationMs: 5000, costEstimateSek: 0.002, aiStatus: "ok" },
    now: new Date("2026-10-09T12:00:00Z"),
    ...over,
  };
}

describe("assembleProfile: the model's claims", () => {
  it("keeps claims that cite real facts", () => {
    const p = assembleProfile(input());
    expect(p.overview.summary).toBe("Ett elbolag i Skåne.");
    expect(p.overview.offering).toEqual([{ text: "Elinstallation och värmepumpar.", evidence: ["F1"] }]);
    expect(p.overview.audience).toEqual({ text: "Villaägare.", evidence: ["F1"] });
    expect(p.observations).toHaveLength(1);
  });
  it("drops a claim that cites a fact that does not exist, or none", () => {
    const m = model({ offering: [{ text: "Bra.", evidence: ["F99"] }, { text: "Delvis.", evidence: ["F1", "F98"] }, { text: "Ok.", evidence: ["F2"] }], audience: { text: "Någon.", evidence: ["F77"] } });
    const p = assembleProfile(input({ model: m }));
    expect(p.overview.offering.map((c) => c.text)).toEqual(["Ok."]);
    expect(p.overview.audience).toBeNull();
  });
  it("drops sentences with figures about revenue, profit or staff, whatever the figure", () => {
    const m = model({ observations: [{ text: "Omsättningen är 50 Mkr.", evidence: ["F4"] }, { text: "Företaget har 30 anställda.", evidence: ["F1"] }, { text: "Resultatet ligger runt 2 miljoner kronor.", evidence: ["F4"] }, { text: "Sajten har annonsspårning.", evidence: ["F2"] }] });
    expect(assembleProfile(input({ model: m })).observations.map((c) => c.text)).toEqual(["Sajten har annonsspårning."]);
  });
  it("drops money and percentages that are not in the underlying material, and keeps ones that are", () => {
    const m = model({ offering: [{ text: "Priset börjar på 9 999 kr.", evidence: ["F1"] }, { text: "Priset börjar på 4 900 kr.", evidence: ["F1"] }, { text: "Rabatt på 35 %.", evidence: ["F1"] }, { text: "Över 1200 installerade värmepumpar.", evidence: ["F1"] }] });
    expect(assembleProfile(input({ model: m })).overview.offering.map((c) => c.text)).toEqual(["Priset börjar på 4 900 kr.", "Över 1200 installerade värmepumpar."]);
  });
  it("drops sentences with email addresses or phone numbers", () => {
    const m = model({ offering: [{ text: "Ring 040-12 34 56.", evidence: ["F1"] }, { text: "Skriv till info@x.se.", evidence: ["F1"] }, { text: "Ring +46 40 123 456.", evidence: ["F1"] }, { text: "Elinstallation.", evidence: ["F1"] }] });
    expect(assembleProfile(input({ model: m })).overview.offering.map((c) => c.text)).toEqual(["Elinstallation."]);
  });
  it("replaces dashes with commas, and drops a summary that breaks the rules", () => {
    expect(cleanText("Elbolag – verksamt i Skåne — sedan 2015")).toBe("Elbolag, verksamt i Skåne, sedan 2015");
    expect(assembleProfile(input({ model: model({ summary: "Ett elbolag – mycket bra." }) })).overview.summary).toBe("Ett elbolag, mycket bra.");
    expect(assembleProfile(input({ model: model({ summary: "Omsättning 77 miljoner kronor." }) })).overview.summary).toBeNull();
  });
  it("never lets a dash through anywhere in what the model wrote", () => {
    const dashy = model({ summary: "A – B", offering: [{ text: "C — D", evidence: ["F1"] }], observations: [{ text: "E – F", evidence: ["F2"] }] });
    expect(JSON.stringify(assembleProfile(input({ model: dashy })).overview)).not.toMatch(/[–—]/);
  });
});

describe("assembleProfile: talking points, creator and links", () => {
  it("keeps talking points that cite real facts and drops the same things it drops everywhere else", () => {
    const m = model({ talkingPoints: [
      { text: "Webbplatsen saknar bokningssystem.", evidence: ["F1"] },
      { text: "Omsättningen är 50 Mkr – ring dem.", evidence: ["F1"] },
      { text: "Ring 08-123 456 78.", evidence: ["F1"] },
      { text: "Saknar belägg.", evidence: ["F99"] },
      { text: "Annonsspårning finns – men ingen e-post.", evidence: ["F2", "F3"] },
    ] });
    expect(assembleProfile(input({ model: m })).talkingPoints?.map((c) => c.text)).toEqual(["Webbplatsen saknar bokningssystem.", "Annonsspårning finns, men ingen e-post."]);
  });
  it("caps talking points at five", () => {
    const m = model({ talkingPoints: Array.from({ length: 5 }, (_, n) => ({ text: `Punkt ${n}`, evidence: ["F1"] })) });
    expect(assembleProfile(input({ model: m })).talkingPoints).toHaveLength(5);
  });
  it("carries the creator, the logo and the platform links through, and defaults to nothing", () => {
    const creator = { name: "Infront Media", url: "https://infront.se", domain: "infront.se", logoPath: "web-infront.se-1.png", supplierSlug: null };
    const links = [{ domain: "bokadirekt.se", name: "Bokadirekt", kind: "Bokning", url: "https://bokadirekt.se/x", supplierSlug: "bokadirekt" }];
    const p = assembleProfile(input({ creator, companyLogoPath: "web-x.se-1.png", platformLinks: links }));
    expect(p).toMatchObject({ creator, companyLogoPath: "web-x.se-1.png", platformLinks: links });
    const bare = assembleProfile(input());
    expect(bare).toMatchObject({ creator: null, companyLogoPath: null, platformLinks: [] });
  });
  it("is complete without AI: no talking points, but everything else", () => {
    expect(assembleProfile(input({ model: null })).talkingPoints).toEqual([]);
  });
});

describe("assembleProfile: services", () => {
  it("lists rule services first, with the AI's additions marked as AI and never stronger than probable", () => {
    const m = model({ services: [{ name: "Fortnox", supplier: "Fortnox", category: "övrigt", basis: "Nämns på sidan.", confidence: "trolig", evidence: ["F1"] }] });
    const p = assembleProfile(input({ model: m }));
    expect(p.services.map((s) => [s.name, s.origin, s.confidence])).toEqual([["Meta (annonsspårning)", "regel", "trolig"], ["Mailchimp", "regel", "stark"], ["Webbplats av Webbyrån AB", "regel", "trolig"], ["Fortnox", "ai", "trolig"]]);
  });
  it("drops an AI service that repeats a rule service, cites nothing real, or quotes a figure", () => {
    const m = model({ services: [
      { name: "Mailchimp", supplier: "Mailchimp", category: "e-post", basis: "Finns.", confidence: "trolig", evidence: ["F3"] },
      { name: "Okänt", supplier: null, category: "övrigt", basis: "Finns.", confidence: "svag", evidence: ["F42"] },
      { name: "Dyr tjänst", supplier: null, category: "övrigt", basis: "Kostar 99 000 kr per månad.", confidence: "trolig", evidence: ["F1"] },
    ] });
    expect(assembleProfile(input({ model: m })).services.filter((s) => s.origin === "ai")).toEqual([]);
  });
});

describe("assembleProfile: facts the model cannot touch", () => {
  it("copies the financial figures from Bolagsverket, whatever the model wrote", () => {
    const p = assembleProfile(input({ model: model({ summary: "Omsättning 1 kr.", observations: [{ text: "Resultat 5 kr.", evidence: ["F4"] }] }) }));
    expect(p.registry.figures).toMatchObject({ revenue: 12_345_000, employees: 9 });
  });
  it("takes contact details from the code only", () => {
    const p = assembleProfile(input({ model: model({ offering: [{ text: "Ring 040-99 99 99.", evidence: ["F1"] }] }) }));
    expect(p.contact).toMatchObject({ phones: ["+4640123456"], emails: ["info@x.se"], address: "Storgatan 1, 211 11 Malmö" });
  });
});

describe("assembleProfile: warnings and degraded profiles", () => {
  it("passes on warnings once each, and adds the advertising block", () => {
    const g = input().gathered;
    g.registry.organisation!.advertisingBlocked = true;
    g.warnings = ["Från resolve"];
    const p = assembleProfile(input({ gathered: g }));
    expect(p.meta.warnings.filter((w) => w === "Från resolve")).toHaveLength(1);
    expect(p.meta.warnings.join(" ")).toContain("Reklamspärr");
  });
  it("is complete without AI, and says why", () => {
    const p = assembleProfile(input({ model: null, meta: { ...input().meta, model: null, aiStatus: "disabled", inputTokens: 0, outputTokens: 0, steps: 0, costEstimateSek: null } }));
    expect(p.overview).toEqual({ summary: null, offering: [], audience: null });
    expect(p.services.length).toBeGreaterThan(0);
    expect(p.registry.status).toBe("ok");
    expect(p.meta.warnings.join(" ")).toContain("AI inte är konfigurerat");
    expect(assembleProfile(input({ model: null, meta: { ...input().meta, aiStatus: "failed" } })).meta.warnings.join(" ")).toContain("kunde inte skriva");
  });
  it("says when there was nothing to summarise", () => {
    const p = assembleProfile(input({ model: null, meta: { ...input().meta, aiStatus: "skipped" } }));
    expect(p.meta.warnings.join(" ")).toContain("inget att sammanfatta");
  });
  it("hides a sole trader's address and says so", () => {
    const base = input();
    const p = assembleProfile({ ...base, resolved: { ...base.resolved, soleTrader: true, orgnr: "670406-1230", orgnrDisplay: "670406-****" } });
    expect(p.contact.address).toBeNull();
    expect(p.company).toMatchObject({ orgnr: "670406-****", soleTrader: true });
    expect(p.meta.warnings.join(" ")).toContain("Enskild firma");
    expect(JSON.stringify(p)).not.toContain("1230");
  });
  it("is deterministic", () => {
    expect(JSON.stringify(assembleProfile(input()))).toBe(JSON.stringify(assembleProfile(input())));
  });
});

describe("sentenceAllowed", () => {
  it("allows plain sentences, and numbers that are not money or finance", () => {
    expect(sentenceAllowed("Företaget finns i Malmö och Lund.", "")).toBe(true);
    expect(sentenceAllowed("Grundat 2015.", "")).toBe(true);
  });
  it("matches numbers regardless of spaces and separators in the material", () => {
    expect(sentenceAllowed("Från 4 900 kr.", "Priset börjar på 4900 kr")).toBe(true);
    expect(sentenceAllowed("Från 4900 kr.", "Priset börjar på 4 900 kr")).toBe(true);
  });
});
