import { describe, expect, it, vi } from "vitest";
import { BolagsverketError } from "@/lib/bolagsverket/client";
import { FactBook } from "./facts";
import { gather, pickExtraPages, pickPeoplePages, registryFacts, type GatherDeps, type GatherInput } from "./gather";
import type { SafePage } from "./safe-fetch";

const org = (over: Record<string, unknown> = {}) => ({
  orgnr: "556503-8212", name: "Test AB", otherNames: [], legalForm: { code: "AB", label: "Aktiebolag" }, registeredAt: "2012-03-01", active: true, deregisteredAt: null, deregistrationReason: null,
  proceedings: [], description: "Vi säljer tjänster", sni: [{ code: "43.210", label: "Elinstallationer" }], address: { street: "Storgatan 1", postalCode: "211 11", city: "Malmö", co: null }, advertisingBlocked: null, unavailable: [], ...over,
});
const FIGURES = { periodEnd: "2025-12-31", registeredAt: null, revenue: 12_345_000, profit: 800_000, employees: 9, equity: 2_000_000, totalAssets: 5_000_000, solidity: 40.2 };

const HOME = `<html><head><title>Test AB</title><meta name="viewport" content="width=device-width"><meta name="generator" content="WordPress 6.4.2">
<script src="https://connect.facebook.net/sv_SE/fbevents.js"></script><script src="/wp-content/plugins/woocommerce/x.js"></script></head>
<body><a href="/kontakt">Kontakt</a><a href="/om-oss">Om oss</a><a href="https://www.facebook.com/testab">f</a><p>Org.nr 556503-8212. Ring 040-12 34 56 eller info@test.se</p><footer>© 2024 Hemsida skapad av Webbyrån AB</footer></body></html>`;

function page(url: string, html: string | null, over: Partial<SafePage> = {}): SafePage {
  return { url, finalUrl: url, status: html ? 200 : 0, html, headers: {}, problem: html ? null : "Webbplatsen svarade inte.", ...over };
}

function deps(over: Partial<GatherDeps> & { sites?: Record<string, SafePage>; calls?: string[] } = {}): GatherDeps & { calls: string[] } {
  const calls = over.calls ?? [];
  const sites = over.sites ?? {};
  return {
    safeFetch: async (url: string) => { calls.push(`fetch:${url}`); return sites[url] ?? page(url, null); },
    lookupDns: async () => ({ mx: ["aspmx.l.google.com"], ns: [], txt: [] }),
    getOrganisation: async () => { calls.push("getOrganisation"); return org() as never; },
    getAnnualFigures: async () => { calls.push("getAnnualFigures"); return FIGURES; },
    refreshRegistry: async () => { calls.push("refreshRegistry"); return { version: 1, organisation: org() as never, organisationFetchedAt: "x", annualReport: FIGURES, annualReportFetchedAt: "x" }; },
    persistAudit: async () => { calls.push("persistAudit"); },
    bolagsverket: { configured: true, test: false },
    ...over,
    calls,
  } as GatherDeps & { calls: string[] };
}

const input = (over: Partial<GatherInput> = {}): GatherInput => ({ orgnr: "556503-8212", soleTrader: false, domain: "test.se", companyId: "c1", websiteUnverified: false, registryCached: null, ...over });
const SITES = { "https://test.se": page("https://test.se", HOME), "https://test.se/kontakt": page("https://test.se/kontakt", "<html><body>Kontakt: 040-98 76 54</body></html>"), "https://test.se/om-oss": page("https://test.se/om-oss", "<html><body>Om oss: vi är elektriker</body></html>") };

describe("gather: a normal company", () => {
  it("collects registry, website, tech, marketing, social, DNS and page texts", async () => {
    const d = deps({ sites: SITES });
    const r = await gather(input(), d);
    expect(r.registry).toMatchObject({ status: "ok", figuresStatus: "ok", figures: { revenue: 12_345_000 } });
    expect(r.site).toMatchObject({ status: "ok", domain: "test.se", url: "https://test.se" });
    expect(r.site.audit).toMatchObject({ cms: "WordPress", cmsVersion: "6.4.2", credit: "Webbyrån AB" });
    expect(r.site.tech.map((t) => t.id)).toContain("woocommerce");
    expect(r.marketingTech.map((t) => t.id)).toContain("meta");
    expect(r.social).toEqual([{ network: "facebook", url: "https://www.facebook.com/testab" }]);
    expect(r.dns.map((x) => x.id)).toContain("mail-google");
    expect(r.texts).toHaveLength(3);
    for (const t of r.texts) expect(r.facts.find((f) => f.id === t.id)).toMatchObject({ kind: "page", source: t.url });
    expect(r.contact.emails).toContain("info@test.se");
    expect(d.calls).toContain("persistAudit");
    expect(r.pages.map((p) => p.url)).toEqual(["https://test.se", "https://test.se/kontakt", "https://test.se/om-oss"]);
  });
  it("turns what it found into numbered facts that name their source", async () => {
    const r = await gather(input(), deps({ sites: SITES }));
    const byDetector = new Map(r.facts.map((f) => [f.detector, f]));
    expect(byDetector.get("meta")).toMatchObject({ kind: "detector", source: "https://test.se", label: "Meta-pixel" });
    expect(byDetector.get("credit")).toMatchObject({ value: "Webbyrån AB" });
    expect(byDetector.get("registry:omsättning")).toMatchObject({ value: expect.stringMatching(/12\s345\s000 kr/), source: expect.stringContaining("2025-12-31") });
    expect(byDetector.get("mail-google")).toMatchObject({ kind: "dns", source: "DNS" });
    expect(r.facts.every((f, idx, all) => all.findIndex((x) => x.id === f.id) === idx)).toBe(true);
    expect(r.facts.map((f) => f.id).sort()).toEqual(r.facts.map((_, n) => `F${n + 1}`).sort());
  });
  it("finds the agency with its link, the platforms the site links to, and notes about the site as facts", async () => {
    const withCredit = HOME.replace("Hemsida skapad av Webbyrån AB", `Hemsida skapad av <a href="https://www.webbyran.se/">Webbyrån AB</a> <a href="https://www.bokadirekt.se/places/x">Boka</a>`);
    const r = await gather(input(), deps({ sites: { ...SITES, "https://test.se": page("https://test.se", withCredit) } }));
    expect(r.creator).toEqual({ name: "Webbyrån AB", url: "https://www.webbyran.se", domain: "webbyran.se", phrase: "made-by", classification: null });
    expect(r.platformLinks.map((p) => p.name)).toEqual(["Bokadirekt"]);
    expect(r.facts.find((f) => f.detector === "platform:bokadirekt.se")).toMatchObject({ kind: "directory", label: "Webbplatsen länkar till Bokadirekt", value: "Bokning" });
  });
  it("never fetches more than the budget, and only inside the site", async () => {
    const d = deps({ sites: SITES });
    const r = await gather(input(), d);
    expect(r.budget.used).toBeLessThanOrEqual(3);
    expect(d.calls.filter((c) => c.startsWith("fetch:")).every((c) => c.startsWith("fetch:https://test.se"))).toBe(true);
  });
});

describe("gather: finding the org.nr on the site", () => {
  it("looks up the registry after the site when the org.nr was unknown", async () => {
    const d = deps({ sites: SITES });
    const r = await gather(input({ orgnr: null }), d);
    expect(r.orgnr).toBe("556503-8212");
    expect(r.registry.status).toBe("ok");
    expect(d.calls.some((c) => c === "refreshRegistry" || c === "getOrganisation")).toBe(true);
  });
  it("reports that no registry data exists when neither the user nor the site gives a number", async () => {
    const r = await gather(input({ orgnr: null }), deps({ sites: { "https://test.se": page("https://test.se", "<html><body>Hej</body></html>") } }));
    expect(r.registry).toMatchObject({ status: "no_orgnr" });
  });
});

describe("gather: a site found through Places", () => {
  it("is confirmed when the site shows the same org.nr", async () => {
    const r = await gather(input({ websiteUnverified: true }), deps({ sites: SITES }));
    expect(r.websiteVerified).toBe(true);
    expect(r.site.status).toBe("ok");
  });
  it("is thrown away when the site shows a different org.nr", async () => {
    const other = HOME.replace("556503-8212", "556677-8899");
    const r = await gather(input({ websiteUnverified: true }), deps({ sites: { "https://test.se": page("https://test.se", other) } }));
    expect(r.site).toMatchObject({ status: "mismatch", tech: [], audit: null });
    expect(r.marketingTech).toEqual([]);
    expect(r.warnings.join(" ")).toContain("556677-8899");
  });
  it("stays unconfirmed, but is used, when the site shows no org.nr at all", async () => {
    const none = HOME.replace("Org.nr 556503-8212. ", "");
    const r = await gather(input({ websiteUnverified: true }), deps({ sites: { "https://test.se": page("https://test.se", none) } }));
    expect(r.websiteVerified).toBe(false);
    expect(r.site.status).toBe("ok");
  });
});

describe("gather: sites that do not behave", () => {
  it("follows one redirect to another domain and uses it from then on", async () => {
    const sites = {
      "https://test.se": page("https://test.se", null, { status: 301, finalUrl: "https://nytt.com/", problem: "Omdirigeringen leder utanför företagets webbplats." }),
      "https://nytt.com": page("https://nytt.com", HOME),
    };
    const r = await gather(input({ orgnr: null }), deps({ sites }));
    expect(r.site).toMatchObject({ status: "ok", domain: "nytt.com" });
    expect(r.warnings.join(" ")).toContain("omdirigerar till nytt.com");
  });
  it("reports a robot check as blocked, with no tech", async () => {
    const challenge = `<html><head><meta http-equiv="refresh" content="0;url=/sgcaptcha"></head><body></body></html>`;
    const r = await gather(input(), deps({ sites: { "https://test.se": page("https://test.se", challenge) } }));
    expect(r.site).toMatchObject({ status: "blocked", tech: [], audit: null });
  });
  it("calls a 403 blocked and a dead site unreachable, and tries plain http once for a dead site", async () => {
    const forbidden = await gather(input(), deps({ sites: { "https://test.se": page("https://test.se", null, { status: 403, problem: "Webbplatsen svarade 403." }) } }));
    expect(forbidden.site.status).toBe("blocked");
    const d = deps();
    const dead = await gather(input(), d);
    expect(dead.site.status).toBe("unreachable");
    expect(d.calls).toEqual(expect.arrayContaining(["fetch:https://test.se", "fetch:http://test.se"]));
  });
  it("never tries http for an address that is not public", async () => {
    const d = deps({ sites: { "https://test.se": page("https://test.se", null, { problem: "Adressen går inte att nå (inte en offentlig adress)." }) } });
    await gather(input(), d);
    expect(d.calls).not.toContain("fetch:http://test.se");
  });
  it("works without a website at all", async () => {
    const r = await gather(input({ domain: null }), deps());
    expect(r.site).toMatchObject({ status: "none" });
    expect(r.registry.status).toBe("ok");
  });
});

describe("gather: the registry", () => {
  it("says Bolagsverket is not configured, in test mode, or failing, without failing the profile", async () => {
    expect((await gather(input({ domain: null }), deps({ bolagsverket: { configured: false, test: false } }))).registry.status).toBe("not_configured");
    expect((await gather(input({ domain: null }), deps({ bolagsverket: { configured: true, test: true } }))).registry.status).toBe("test");
    const down = await gather(input({ domain: null }), deps({ refreshRegistry: async () => { throw new BolagsverketError("x", true); } }));
    expect(down.registry).toMatchObject({ status: "error", message: "Bolagsverket svarade inte just nu." });
  });
  it("tells a missing digital annual report from a failed lookup", async () => {
    const none = await gather(input({ domain: null }), deps({ refreshRegistry: async () => ({ version: 1, organisation: org() as never, organisationFetchedAt: "x", annualReport: null, annualReportFetchedAt: "x" }) }));
    expect(none.registry).toMatchObject({ status: "ok", figures: null, figuresStatus: "none_digital" });
  });
  it("reports an unknown number", async () => {
    const r = await gather(input({ domain: null }), deps({ refreshRegistry: async () => ({ version: 1, organisation: null, organisationFetchedAt: "x" }) }));
    expect(r.registry.status).toBe("not_found");
  });
});

describe("gather: a sole trader", () => {
  const sole = input({ orgnr: "670406-1230", soleTrader: true, companyId: "c9" });
  it("is looked up directly, never through the catalog's registry cache, with no annual report", async () => {
    const d = deps({ sites: SITES });
    const r = await gather(sole, d);
    expect(d.calls).toContain("getOrganisation");
    expect(d.calls).not.toContain("refreshRegistry");
    expect(d.calls).not.toContain("getAnnualFigures");
    expect(r.registry).toMatchObject({ status: "ok", figures: null, figuresStatus: "not_applicable" });
  });
  it("keeps the number masked and the home address out of the result", async () => {
    const d = deps({ sites: SITES, getOrganisation: async () => org({ orgnr: "670406-1230", address: { street: "Hemvägen 5", postalCode: "123 45", city: "Lund", co: null } }) as never });
    const r = await gather(sole, d);
    expect(r.registry.organisation).toMatchObject({ orgnr: "670406-****", address: { street: null, postalCode: null, city: "Lund" } });
    const everything = JSON.stringify({ ...r, orgnr: undefined });
    expect(everything).not.toContain("1230");
    expect(everything).not.toContain("Hemvägen");
  });
});

describe("pickExtraPages", () => {
  const inv = (...paths: string[]) => paths.map((p) => ({ url: `https://x.se${p}`, text: "" }));
  it("takes the contact page and the about page, once each", () => {
    expect(pickExtraPages(inv("/nyhet", "/om-oss", "/kontakt", "/kontakta-oss")).map((l) => l.url)).toEqual(["https://x.se/kontakt", "https://x.se/om-oss"]);
  });
  it("finds nothing when there is nothing to find", () => {
    expect(pickExtraPages(inv("/nyhet", "/blogg"))).toEqual([]);
  });
});

describe("registryFacts", () => {
  it("writes each figure as its own fact and skips the empty ones", () => {
    const b = new FactBook();
    registryFacts(b, org() as never, { ...FIGURES, profit: null, solidity: null }, false);
    const labels = b.all().map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(["Bolagsform", "Omsättning", "Anställda (medeltal)", "Adress"]));
    expect(labels).not.toContain("Årets resultat");
    expect(labels).not.toContain("Soliditet");
  });
  it("adds last year's figures and the growth when the report has a comparison year", () => {
    const b = new FactBook();
    const prev = { periodEnd: "2022-12-31", revenue: 800_000, profit: 10_000, employees: 3, equity: 1 };
    registryFacts(b, org() as never, { ...FIGURES, revenue: 1_000_000, previous: prev, history: [{ periodEnd: "2021-12-31", revenue: 600_000, profit: null, employees: null, equity: null }] }, false);
    const byLabel = Object.fromEntries(b.all().map((f) => [f.label, f.value]));
    expect(byLabel["Omsättningens förändring"]).toBe("+25 % mot föregående år");
    expect(byLabel["Omsättning föregående år"]).toContain("800");
    expect(byLabel["Omsättning tidigare år"]).toContain("2021");
  });
  it("adds the advertising block as a fact", () => {
    const b = new FactBook();
    registryFacts(b, org({ advertisingBlocked: true }) as never, null, false);
    expect(b.all().map((f) => f.label)).toContain("Reklamspärr");
  });
});

describe("gather: who stands behind the site", () => {
  const FOOTER = `<a href="https://www.snowfire.se/x?utm_campaign=poweredby"><img src="/s.svg" alt="Powered by Snowfire"></a> <a href="https://www.beegleton.com/">Skapad av Beegleton</a>`;
  const home = HOME.replace("Hemsida skapad av Webbyrån AB", FOOTER);

  it("picks the agency over the platform, shows the platform as a technology, and makes the credit fact agree", async () => {
    const r = await gather(input(), deps({ sites: { ...SITES, "https://test.se": { ...SITES["https://test.se"], html: home } } }));
    expect(r.creator).toMatchObject({ name: "Beegleton", domain: "beegleton.com", phrase: "made-by" });
    expect(r.site.tech.map((t) => t.name)).toContain("Snowfire");
    expect(r.site.audit?.credit).toBe("Beegleton");
    expect(r.facts.find((f) => f.detector === "credit")?.value).toBe("Beegleton");
  });
  it("moves a credit the classifier calls a platform out of the agency slot and into the technologies", async () => {
    const html = HOME.replace("Hemsida skapad av Webbyrån AB", `Powered by <a href="https://nyplattform.se">Ny Plattform</a>`);
    const classifyCredit = (async () => ({ kind: "platform", source: "ai", reason: "Sajtbyggare" })) as never;
    const r = await gather(input(), { ...deps({ sites: { ...SITES, "https://test.se": { ...SITES["https://test.se"], html } } }), classifyCredit });
    expect(r.creator).toBeNull();
    expect(r.site.tech.map((t) => t.name)).toContain("Ny Plattform");
    expect(r.facts.some((f) => f.detector === "credit")).toBe(false);
  });
});

describe("gather: Claude reads a footer the rules cannot", () => {
  const html = HOME.replace("Hemsida skapad av Webbyrån AB", `Hemsidan skapades med stolthet av <a href="https://arly.se/">ARLY</a>`);
  const sites = { ...SITES, "https://test.se": page("https://test.se", html) };
  const ai = (role: "agency" | "platform") => (async () => ({ name: "ARLY", url: "https://arly.se", domain: "arly.se", role, reason: "Raden pekar ut dem." })) as never;

  it("uses the link Claude points to as the agency, marked as judged by the AI, and keeps the credit fact in step", async () => {
    const r = await gather(input(), { ...deps({ sites }), footerCreditAi: ai("agency") });
    expect(r.creator).toMatchObject({ name: "ARLY", domain: "arly.se", classification: { kind: "agency", source: "ai" } });
    expect(r.facts.find((f) => f.detector === "credit")?.value).toBe("ARLY");
  });
  it("shows a platform Claude points to as a technology, with no agency", async () => {
    const r = await gather(input(), { ...deps({ sites }), footerCreditAi: ai("platform") });
    expect(r.creator).toBeNull();
    expect(r.site.tech.map((t) => t.name)).toContain("ARLY");
  });
  it("does not ask Claude when the rules already found a credit", async () => {
    const asked = vi.fn(async () => null);
    await gather(input(), { ...deps({}), footerCreditAi: asked as never });
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("gather: org.nr from the company name on the site", () => {
  const footer = `<footer><p>SA Konstruktion &amp; Bygg AB</p><p>Åkermans väg 3</p><p>504 31 Borås</p></footer>`;
  const html = HOME.replace("Hemsida skapad av Webbyrån AB", footer).replace("Org.nr 556503-8212. ", "");
  const sites = { ...SITES, "https://test.se": page("https://test.se", html) };
  const noOrgnr = { ...input(), orgnr: null as string | null };
  const found = { ok: true, orgnr: "556767-1796", registryName: "SA konstruktion och bygg Aktiebolag", city: "BORÅS", candidate: { name: "SA Konstruktion & Bygg AB", street: "Åkermans väg 3", postalCode: "50431", city: "Borås", source: "text" } };

  it("looks the name up when no org.nr is on the site, and fetches the registry for the confirmed number", async () => {
    const lookupOrgnr = vi.fn(async () => found) as never;
    const base = deps({ sites });
    const refreshRegistry = vi.fn(base.refreshRegistry);
    const r = await gather(noOrgnr, { ...base, refreshRegistry, lookupOrgnr });
    const asked = (lookupOrgnr as unknown as { mock: { calls: unknown[][][] } }).mock.calls[0][0];
    // Namnet med adress kommer först.
    expect(asked[0]).toMatchObject({ name: "SA Konstruktion & Bygg AB", city: "Borås" });
    expect(r.orgnr).toBe("556767-1796");
    expect(refreshRegistry.mock.calls[0][0]).toMatchObject({ orgnr: "556767-1796" });
    expect(r.warnings.join(" ")).toContain("bekräftades mot Bolagsverket");
  });
  it("does not look anything up when the site already shows an org.nr, or for a sole trader", async () => {
    const lookup = vi.fn(async () => found) as never;
    await gather(input(), { ...deps({}), lookupOrgnr: lookup });
    await gather({ ...noOrgnr, soleTrader: true }, { ...deps({ sites }), lookupOrgnr: lookup });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("carries on without an org.nr when the lookup finds nothing or fails", async () => {
    const none = (async () => ({ ok: false, reason: "no-match" })) as never;
    const failing = (async () => { throw new Error("nere"); }) as never;
    for (const lookupOrgnr of [none, failing]) {
      const r = await gather(noOrgnr, { ...deps({ sites }), lookupOrgnr });
      expect(r.orgnr).toBeNull();
      expect(r.registry.status).toBe("no_orgnr");
    }
  });

  it("never looks up the agency or platform credited in the footer as if it were the company", async () => {
    const credited = html.replace("</footer>", `<p>Webbplats av <a href="https://webbofsweden.se">Webb of Sweden AB</a> Arkitektgatan 25 215 63 Malmö</p></footer>`);
    const lookup = vi.fn(async () => ({ ok: false, reason: "no-match" })) as never;
    await gather(noOrgnr, { ...deps({ sites: { ...SITES, "https://test.se": page("https://test.se", credited) } }), lookupOrgnr: lookup });
    const asked = (lookup as unknown as { mock: { calls: { name: string }[][][] } }).mock.calls[0][0].map((c) => c.name);
    expect(asked).toContain("SA Konstruktion & Bygg AB");
    expect(asked).not.toContain("Webb of Sweden AB");
  });
});


describe("pickPeoplePages and the pages kept for people extraction", () => {
  const inv = (...paths: string[]) => paths.map((p) => ({ url: `https://x.se${p}`, text: p.replace(/\//g, " ").trim() }));

  it("picks team, personnel, management and 'about me' pages, not the ones already chosen", () => {
    const picked = pickPeoplePages(inv("/nyhet", "/vart-team", "/kontakt", "/personal", "/ledning", "/om-mig", "/tjanster"), new Set(["https://x.se/kontakt"]));
    expect(picked.map((l) => l.url)).toEqual(["https://x.se/vart-team", "https://x.se/personal", "https://x.se/ledning"]);
  });
  it("matches on the link text too, and gives nothing when there is no such page", () => {
    expect(pickPeoplePages([{ url: "https://x.se/p/12", text: "Våra medarbetare" }], new Set()).map((l) => l.url)).toEqual(["https://x.se/p/12"]);
    expect(pickPeoplePages(inv("/nyhet", "/tjanster", "/kontakt"), new Set())).toEqual([]);
  });
  it("fetches a team page from the home page's links and keeps its HTML, without adding it to the texts the AI reads", async () => {
    const home = HOME.replace("<a href=\"/kontakt\">Kontakt</a>", `<a href="/kontakt">Kontakt</a><a href="/vart-team">Vårt team</a>`);
    const team = "<html><body><h1>Vårt team</h1><p>Anna Berg, VD</p></body></html>";
    const sites = { ...SITES, "https://test.se": page("https://test.se", home), "https://test.se/vart-team": page("https://test.se/vart-team", team) };
    const r = await gather(input(), deps({ sites }));
    expect(r.peoplePages.map((p) => p.url)).toContain("https://test.se/vart-team");
    expect(r.peoplePages.map((p) => p.url)).toContain("https://test.se");
    expect(r.texts.map((t) => t.url)).not.toContain("https://test.se/vart-team");
  });
});
