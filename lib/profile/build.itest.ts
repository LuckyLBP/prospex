import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db";
import { buildProfile, inputForBuild, type BuildDeps } from "./build";
import type { Network } from "./network";
import { parseProfileInput } from "./input";
import { resolveInput, type ResolveDeps } from "./resolve";
import { PageBudget } from "./safe-fetch";
import { getProfile, startProfile } from "./store";
import type { GatherResult } from "./gather";
import type { Fact, ProfileModelOutput } from "./types";

const D = { a: "zz-bygg-a.se", b: "zz-bygg-b.se", c: "zz-bygg-c.se", d: "zz-bygg-d.se" };
const by = { id: null as string | null };

afterAll(async () => {
  await pool.query(`delete from company_profiles where domain like 'zz-bygg%' or input like 'zz-bygg%' or orgnr like '670406-%'`);
  await pool.query(`delete from companies where dedupe_key like 'zz-bygg%' or dedupe_key like 'profil:%' or domain like 'zz-bygg%'`);
  await pool.end();
});
beforeEach(async () => {
  await pool.query(`delete from company_profiles where domain like 'zz-bygg%' or input like 'zz-bygg%' or orgnr like '670406-%'`);
});

const noExternal: ResolveDeps = {
  findCompanyByOrgnr: async () => null, findCompanyByDomain: async (d: string) => (await pool.query(`select id, name, orgnr, domain, website, registry, dedupe_key from companies where domain = $1 limit 1`, [d])).rows[0] ?? null,
  getOrganisation: async () => null, findWebsiteByName: async () => null, bolagsverket: { configured: false, test: false }, placesConfigured: false,
};

const FACTS: Fact[] = [
  { id: "F1", kind: "page", label: "Startsidan hämtades", value: "https://zz-bygg-a.se", source: "https://zz-bygg-a.se", detector: "page:home" },
  { id: "F2", kind: "detector", label: "Mailchimp", value: "finns på sidan", source: "https://zz-bygg-a.se", detector: "mailchimp" },
];
const gathered = (domain: string | null, over: Partial<GatherResult> = {}): GatherResult => ({
  facts: FACTS, registry: { status: "no_orgnr", message: "Inget organisationsnummer att slå upp.", organisation: null, figures: null, figuresStatus: "not_fetched" },
  site: { status: domain ? "ok" : "none", message: null, domain, url: domain ? `https://${domain}` : null, audit: null, tech: [] }, marketingTech: [], social: [], inventory: [], creator: null, platformLinks: [], dns: [], ips: [],
  contact: { phones: ["+4640123456"], emails: ["info@zz-bygg-a.se"], companyName: "Bygg A AB" }, pages: [{ url: "https://zz-bygg-a.se", status: 200, bytes: 100, via: "code", problem: null }],
  texts: [{ id: "F1", url: "https://zz-bygg-a.se", text: "Vi bygger hus." }], peoplePages: [], orgnr: null, websiteVerified: true, siteDomain: domain, warnings: [], boundary: domain, budget: new PageBudget(), ...over,
});
const OUT: ProfileModelOutput = { summary: "Ett byggbolag.", offering: [{ text: "Husbyggen.", evidence: ["F1"] }], audience: null, services: [], observations: [], talkingPoints: [] };

function deps(over: Partial<BuildDeps> = {}, g: GatherResult | ((i: Parameters<BuildDeps["gather"]>[0]) => GatherResult) = gathered(D.a)): BuildDeps & { seen: Parameters<BuildDeps["gather"]>[0][] } {
  const seen: Parameters<BuildDeps["gather"]>[0][] = [];
  return {
    resolveInput: (p) => resolveInput(p, noExternal),
    gather: async (i) => { seen.push(i); return typeof g === "function" ? g(i) : g; },
    runAgent: async () => ({ output: OUT, inputTokens: 2000, outputTokens: 300, steps: 1, model: "deepseek/deepseek-v4-flash" }),
    aiConfigured: () => true,
    buildNetwork: async () => ({ creator: null, companyLogoPath: null, platformLinks: [], presence: [] }) as Network,
    maybeStartAgency: async () => ({ started: false, reason: "disabled" }),
    extractPeople: async () => ({ people: [], pagesRead: 0, costSek: 0 }),
    seen, ...over,
  };
}
const url = (d: string) => { const p = parseProfileInput(d); if (p.kind !== "url") throw new Error("fel testdata"); return p; };

describe("buildProfile: a web address", () => {
  it("builds a profile, adds the company to the catalog, and records what it cost", async () => {
    const { id } = await startProfile(url(D.a), by);
    await buildProfile(id, {}, deps());
    const row = await getProfile(id);
    expect(row).toMatchObject({ status: "done", stage: null, domain: D.a, model: "deepseek/deepseek-v4-flash", input_tokens: 2000, output_tokens: 300, steps: 1 });
    expect((row!.profile as { overview: { summary: string } }).overview.summary).toBe("Ett byggbolag.");
    expect((row!.profile as { services: { name: string }[] }).services.map((s) => s.name)).toContain("Mailchimp");
    const company = (await pool.query(`select id, dedupe_key, domain, name, phone, email from companies where domain = $1`, [D.a])).rows[0];
    expect(company).toMatchObject({ dedupe_key: D.a, phone: "+4640123456", email: "info@zz-bygg-a.se" });
    expect(row!.company_id).toBe(company.id);
  });
  it("hands the AI step the rule services, and what the gather step needs", async () => {
    let known: string[] = [];
    const d = deps({ runAgent: async (a) => { known = (a.knownServices ?? []).map((s) => s.name); return { output: OUT, inputTokens: 1, outputTokens: 1, steps: 1, model: "m" }; } });
    const { id } = await startProfile(url(D.a), by);
    await buildProfile(id, {}, d);
    expect(known).toEqual(["Mailchimp"]);
    expect(d.seen[0]).toMatchObject({ domain: D.a, soleTrader: false, websiteUnverified: false });
  });
  it("still saves a complete deterministic profile when the AI step fails", async () => {
    const { id } = await startProfile(url(D.b), by);
    await buildProfile(id, {}, deps({ runAgent: async () => { throw new Error("modellen svarar inte"); } }, gathered(D.b)));
    const row = await getProfile(id);
    expect(row).toMatchObject({ status: "done", model: null });
    const p = row!.profile as { overview: { summary: string | null }; meta: { aiStatus: string; warnings: string[] } };
    expect(p.overview.summary).toBeNull();
    expect(p.meta.aiStatus).toBe("failed");
    expect(p.meta.warnings.join(" ")).toContain("kunde inte skriva");
  });
  it("skips the AI when it is not configured, or when there is nothing to summarise", async () => {
    const a = await startProfile(url(D.c), by);
    await buildProfile(a.id, {}, deps({ aiConfigured: () => false }, gathered(D.c)));
    expect(((await getProfile(a.id))!.profile as { meta: { aiStatus: string } }).meta.aiStatus).toBe("disabled");
    const b = await startProfile(url(D.d), by);
    let called = false;
    await buildProfile(b.id, {}, deps({ runAgent: async () => { called = true; throw new Error("ska inte anropas"); } }, gathered(null, { texts: [], site: { status: "unreachable", message: "x", domain: D.d, url: null, audit: null, tech: [] } })));
    expect(called).toBe(false);
    expect(((await getProfile(b.id))!.profile as { meta: { aiStatus: string } }).meta.aiStatus).toBe("skipped");
  });
  it("stores the creator, the logos, the platform links and our own presence, and gives the AI the presence as facts", async () => {
    let factLabels: string[] = [];
    const network: Network = {
      creator: { name: "Infront Media", url: "https://infront.se", domain: "infront.se", logoPath: "infront-1.png", supplierSlug: null }, companyLogoPath: "web-zz-bygg-a.se-1.png",
      platformLinks: [{ domain: "bokadirekt.se", name: "Bokadirekt", kind: "Bokning", url: "https://bokadirekt.se/x", supplierSlug: "bokadirekt" }],
      presence: [{ slug: "brabyggare", name: "BraByggare", kind: "supplier", published: true, logoPath: null, category: null, namesBrand: true, sourceUrl: "https://brabyggare.se/h/1", firstSeen: null, lastSeen: null }],
    };
    const d = deps({ buildNetwork: async () => network, runAgent: async (a) => { factLabels = a.ctx.book.all().map((f) => f.label); return { output: { ...OUT, talkingPoints: [{ text: "Företaget finns hos BraByggare.", evidence: ["F3"] }] }, inputTokens: 1, outputTokens: 1, steps: 1, model: "m" }; } });
    const { id } = await startProfile(url(D.a), by);
    await buildProfile(id, {}, d);
    const p = (await getProfile(id))!.profile as { creator: { name: string; logoPath: string }; companyLogoPath: string; platformLinks: { supplierSlug: string }[]; talkingPoints: { text: string }[]; facts: { label: string }[] };
    expect(p.creator).toMatchObject({ name: "Infront Media", logoPath: "infront-1.png" });
    expect(p.companyLogoPath).toBe("web-zz-bygg-a.se-1.png");
    expect(p.platformLinks[0].supplierSlug).toBe("bokadirekt");
    expect(factLabels).toContain("Finns hos BraByggare");
    expect(p.facts.map((f) => f.label)).toContain("Finns hos BraByggare");
    expect(p.talkingPoints.map((t) => t.text)).toEqual(["Företaget finns hos BraByggare."]);
  });
  it("still builds the profile when the network step throws", async () => {
    const { id } = await startProfile(url(D.b), by);
    await buildProfile(id, {}, deps({ buildNetwork: async () => { throw new Error("nere"); } }, gathered(D.b)));
    const row = await getProfile(id);
    expect(row).toMatchObject({ status: "done" });
    expect((row!.profile as { creator: unknown }).creator).toBeNull();
  });
  it("marks the profile as failed, with a reason, when something unexpected breaks", async () => {
    const { id } = await startProfile(url(D.a), by);
    await buildProfile(id, {}, deps({ gather: async () => { throw new Error("databasen låg nere"); } }));
    expect(await getProfile(id)).toMatchObject({ status: "error", error: "Oväntat fel: databasen låg nere" });
  });
  it("does nothing for a profile that is already being built", async () => {
    const { id } = await startProfile(url(D.a), by);
    await pool.query(`update company_profiles set status = 'done' where id = $1`, [id]);
    const d = deps();
    await buildProfile(id, {}, d);
    expect(d.seen).toHaveLength(0);
  });
});

describe("buildProfile: a sole trader", () => {
  const sole = () => { const p = parseProfileInput("670406-1230"); if (p.kind !== "orgnr") throw new Error("fel testdata"); return p; };
  it("uses the full number in memory only, and leaves no part of it in the database", async () => {
    const d = deps({}, (i) => gathered(null, { orgnr: i.orgnr, siteDomain: null, texts: [], site: { status: "none", message: "Ingen webbplats känd.", domain: null, url: null, audit: null, tech: [] }, registry: { status: "ok", message: null, organisation: { orgnr: "670406-****", name: "Enskild Firma", legalForm: null, registeredAt: null, active: true, deregisteredAt: null, deregistrationReason: null, proceedings: [], description: null, sni: [], advertisingBlocked: null, address: { street: null, postalCode: null, city: "Lund" } }, figures: null, figuresStatus: "not_applicable" } }));
    const { id } = await startProfile(sole(), by);
    await buildProfile(id, { orgnr: "670406-1230" }, d);
    expect(d.seen[0]).toMatchObject({ orgnr: "670406-1230", soleTrader: true });
    const row = await getProfile(id);
    expect(row).toMatchObject({ status: "done", orgnr: "670406-****", sole_trader: true });
    const everything = JSON.stringify((await pool.query(`select * from company_profiles where id = $1`, [id])).rows[0]) + JSON.stringify((await pool.query(`select * from companies where id = $1`, [row!.company_id])).rows[0]);
    expect(everything).not.toContain("1230");
    expect((await pool.query(`select orgnr, dedupe_key from companies where id = $1`, [row!.company_id])).rows[0]).toEqual({ orgnr: null, dedupe_key: `profil:${id}` });
  });
  it("on update builds from the website only, and says the number is not kept", () => {
    const row = { input_kind: "orgnr" as const, input: "670406-****", orgnr: "670406-****", sole_trader: true, domain: "zz-bygg-a.se" };
    expect(inputForBuild(row, null)).toMatchObject({ parsed: { kind: "url", domain: "zz-bygg-a.se" }, note: expect.stringContaining("sparas inte") });
    expect(inputForBuild(row, "670406-1230").parsed).toMatchObject({ kind: "orgnr", soleTrader: true });
    expect(inputForBuild({ ...row, domain: null }, null).parsed).toBeNull();
  });
});

describe("inputForBuild", () => {
  it("rebuilds a web address or a company number from the row", () => {
    expect(inputForBuild({ input_kind: "url", input: "foretag.se", orgnr: null, sole_trader: false, domain: "foretag.se" }, null).parsed).toMatchObject({ kind: "url", domain: "foretag.se" });
    expect(inputForBuild({ input_kind: "orgnr", input: "556503-8212", orgnr: "556503-8212", sole_trader: false, domain: null }, null).parsed).toMatchObject({ kind: "orgnr", orgnr: "556503-8212" });
  });
});

describe("buildProfile: a scan that targets a catalog company", () => {
  const eniro = async () => (await pool.query(`insert into companies (dedupe_key, name, phone, first_seen_at, last_seen_at) values ('zz-bygg-eniro:1', 'Bygg A i Lund', '+4646111222', now(), now()) returning id`)).rows[0].id as string;
  const cleanup = async () => {
    await pool.query(`delete from company_profiles where target_company_id in (select id from companies where dedupe_key like 'zz-bygg-eniro:%')`);
    await pool.query(`delete from companies where dedupe_key like 'zz-bygg-eniro:%' or domain like 'zz-bygg%'`);
    await pool.query(`delete from organizations where slug = 'zz-bygg-org'`);
  };
  beforeEach(cleanup);
  afterAll(cleanup);

  it("puts the result on that row, with no second company, even though the catalog has no domain or org.nr for it", async () => {
    const companyId = await eniro();
    const { id } = await startProfile(url(D.a), by, { targetCompanyId: companyId });
    await buildProfile(id, {}, deps());
    const row = await getProfile(id);
    expect(row).toMatchObject({ status: "done", company_id: companyId, target_company_id: companyId });
    const rows = (await pool.query(`select id, domain, website, phone, name from companies where domain = $1 or id = $2`, [D.a, companyId])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: companyId, domain: D.a, website: `https://${D.a}`, phone: "+4646111222", name: "Bygg A i Lund" });
  });

  it("does not build again while the company's profile is fresh, and gives the asking company access to it", async () => {
    const companyId = await eniro();
    const org = (await pool.query(`insert into organizations (name, slug) values ('Zz Bygg Org', 'zz-bygg-org') returning id`)).rows[0].id as string;
    const first = await startProfile(url(D.a), by, { targetCompanyId: companyId });
    await buildProfile(first.id, {}, deps());
    const second = await startProfile(url(D.a), by, { targetCompanyId: companyId });
    expect(second).toEqual({ id: first.id, reused: true });
    const third = await startProfile(url(D.a), { id: null, orgId: org }, { targetCompanyId: companyId });
    expect(third).toEqual({ id: first.id, reused: true });
    expect((await pool.query(`select 1 from profile_org_access where profile_id = $1 and org_id = $2`, [first.id, org])).rowCount).toBe(1);
  });

  it("builds a new profile when the old one is more than 30 days old, and the old one's companies keep their access", async () => {
    const companyId = await eniro();
    const org = (await pool.query(`insert into organizations (name, slug) values ('Zz Bygg Org', 'zz-bygg-org') returning id`)).rows[0].id as string;
    const first = await startProfile(url(D.a), { id: null, orgId: org }, { targetCompanyId: companyId });
    await buildProfile(first.id, {}, deps());
    await pool.query(`update company_profiles set finished_at = now() - interval '31 days' where id = $1`, [first.id]);
    const again = await startProfile(url(D.a), by, { targetCompanyId: companyId });
    expect(again.reused).toBe(false);
    await buildProfile(again.id, {}, deps());
    expect(await getProfile(first.id)).toBeNull();
    expect((await pool.query(`select 1 from profile_org_access where profile_id = $1 and org_id = $2`, [again.id, org])).rowCount).toBe(1);
  });
});
