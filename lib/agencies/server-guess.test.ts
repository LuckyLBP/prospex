import { describe, expect, it } from "vitest";
import {
  acceptJudgement, describeHost, guessAgencyByServer, hostSiteCandidates, registrableDomain, MAX_SITES, MIN_SITES, ownsServer, pickCandidate, readCreditFrom, ruleVerdict, sampleSites, tallyReads,
  type GuessDeps, type Judgement, type MemoryRow, type SiblingRead,
} from "./server-guess";

const sibling = (n: number) => `kund${n}.se`;
const ok = (domain: string, credit: SiblingRead["credit"] = null): SiblingRead => ({ domain, status: "ok", credit });
const sitea = { domain: "sitea.se", name: "Sitea" };

describe("tallyReads and pickCandidate", () => {
  it("counts credits per agency domain, most first, with a few example sites", () => {
    const reads = [ok("a.se", sitea), ok("b.se", sitea), ok("c.se", sitea), ok("d.se", sitea), ok("e.se", { domain: "annan.se", name: "Annan" }), ok("f.se"), { domain: "g.se", status: "empty" as const, credit: null }, { domain: "h.se", status: "failed" as const, credit: null }];
    const t = tallyReads(reads);
    expect(t).toMatchObject({ read: 6, empty: 1, failed: 1 });
    expect(t.credits[0]).toEqual({ name: "Sitea", domain: "sitea.se", count: 4, examples: ["a.se", "b.se", "c.se"] });
    expect(pickCandidate(t)?.domain).toBe("sitea.se");
  });
  it("needs three sites, or two that are a quarter of the ones read", () => {
    expect(pickCandidate(tallyReads([ok("a.se", sitea), ok("b.se", sitea), ...Array.from({ length: 10 }, (_, i) => ok(sibling(i)))]))).toBeNull();
    expect(pickCandidate(tallyReads([ok("a.se", sitea), ok("b.se", sitea), ok("c.se"), ok("d.se"), ok("e.se"), ok("f.se")]))?.domain).toBe("sitea.se");
    expect(pickCandidate(tallyReads(Array.from({ length: 12 }, (_, i) => ok(sibling(i), i < 3 ? sitea : null))))?.domain).toBe("sitea.se");
    expect(pickCandidate(tallyReads([ok("a.se", sitea)]))).toBeNull();
  });
  it("does not count pages drawn by JavaScript against the agency", () => {
    const t = tallyReads([ok("a.se", sitea), ok("b.se", sitea), ok("c.se", sitea), ...Array.from({ length: 30 }, (_, i) => ({ domain: `s${i}.se`, status: "empty" as const, credit: null }))]);
    expect(t.read).toBe(3);
    expect(pickCandidate(t)?.domain).toBe("sitea.se");
  });
});

describe("sampleSites", () => {
  it("is the same for the same server, prefers .se and never repeats a site", () => {
    const all = [...Array.from({ length: 40 }, (_, i) => `x${i}.com`), ...Array.from({ length: 40 }, (_, i) => `y${i}.se`), "y1.se"];
    const a = sampleSites(all, "1.2.3.4");
    expect(a).toEqual(sampleSites([...all].reverse(), "1.2.3.4"));
    expect(a).toHaveLength(24);
    expect(a.every((d) => d.endsWith(".se"))).toBe(true);
    expect(new Set(a).size).toBe(24);
  });
});

describe("ownsServer", () => {
  it("matches the agency's domain and its subdomains only", () => {
    expect(ownsServer("fore.tundran.se", "tundran.se")).toBe(true);
    expect(ownsServer("tundran.se.", "tundran.se")).toBe(true);
    expect(ownsServer("n-1-2-3-4.net.forss.net", "tundran.se")).toBe(false);
    expect(ownsServer("notundran.se", "tundran.se")).toBe(false);
    expect(ownsServer(null, "tundran.se")).toBe(false);
  });
});

describe("acceptJudgement", () => {
  const cand = { name: "Sitea", domain: "sitea.se", count: 5, examples: [] };
  const j = (over: Partial<Judgement>): Judgement => ({ verdict: "agency", agencyDomain: "sitea.se", confidence: "high", reason: "x", ...over });
  it("takes an agency only when it is the one the footers named", () => {
    expect(acceptJudgement(j({}), cand)).toBe("agency");
    expect(acceptJudgement(j({ agencyDomain: "https://www.sitea.se/" }), cand)).toBe("agency");
    expect(acceptJudgement(j({ agencyDomain: "uppfunnen.se" }), cand)).toBe("unclear");
    expect(acceptJudgement(j({ agencyDomain: null }), cand)).toBe("unclear");
  });
  it("treats a low confidence answer, or no answer, as unclear, and passes host through", () => {
    expect(acceptJudgement(j({ confidence: "low" }), cand)).toBe("unclear");
    expect(acceptJudgement(null, cand)).toBe("unclear");
    expect(acceptJudgement(j({ verdict: "host", agencyDomain: null }), cand)).toBe("host");
  });
  it("without Claude only a strong proof counts", () => {
    expect(ruleVerdict(tallyReads(Array.from({ length: 12 }, (_, i) => ok(sibling(i), i < 4 ? sitea : null))), { ...cand, count: 4 })).toBe("agency");
    expect(ruleVerdict(tallyReads(Array.from({ length: 24 }, (_, i) => ok(sibling(i), i < 3 ? sitea : null))), { ...cand, count: 3 })).toBe("unclear");
  });
});

// ---------------------------------------------------------------- hela flödet med falska beroenden

function fake(over: Partial<GuessDeps> & { puts?: unknown[]; paid?: string[]; fetched?: string[] } = {}): GuessDeps {
  const puts = over.puts ?? [];
  const paid = over.paid ?? [];
  const fetched = over.fetched ?? [];
  const sites = Array.from({ length: 130 }, (_, i) => sibling(i));
  return {
    memory: { get: async () => null, put: async (r) => { puts.push(r); }, lookupsToday: async () => 0 },
    provenAgency: async () => null,
    reverseDns: async () => null,
    inspectHost: async () => null,
    knownSiblings: async () => [],
    reverseIp: async (ip) => { paid.push(ip); return sites; },
    fetchHome: async (d) => { fetched.push(d); return `<html><body>${"Text ".repeat(60)}</body></html>`; },
    // Var tredje sajt har Sitea i sidfoten, som en länk efter ©-raden och utan "skapad av".
    readCredit: async (_html, d) => (Number(d.match(/\d+/)![0]) % 3 === 0 ? sitea : null),
    classifyAgency: async () => "agency",
    judge: async (e) => ({ verdict: "agency", agencyDomain: e.candidate.domain, confidence: "high", reason: "Många sidfötter nämner Sitea." }),
    verifyOwn: async () => false,
    now: Date.now,
    ...over,
  };
}
const site = { siteDomain: "abnymalat.se", ips: ["81.2.3.4"] };

describe("guessAgencyByServer", () => {
  it("finds the agency from the footers of the sites on the same server, as a likely agency", async () => {
    const puts: unknown[] = [];
    const r = await guessAgencyByServer(site, fake({ puts }));
    expect(r.guess).toMatchObject({ name: "Sitea", domain: "sitea.se", sites: 130, confirmed: false, cached: false });
    expect(r.guess!.credited).toBeGreaterThanOrEqual(3);
    expect(r.guess!.examples.length).toBeGreaterThan(0);
    expect(puts[0]).toMatchObject({ ip: "81.2.3.4", verdict: "agency", agencyDomain: "sitea.se" });
  });
  it("is confirmed when the agency also shows on the site itself", async () => {
    expect((await guessAgencyByServer(site, fake({ verifyOwn: async () => true }))).guess?.confirmed).toBe(true);
  });
  it("is confirmed when the server's own name is under the agency's domain", async () => {
    expect((await guessAgencyByServer(site, fake({ reverseDns: async () => "fore.sitea.se" }))).guess?.confirmed).toBe(true);
    expect((await guessAgencyByServer(site, fake({ reverseDns: async () => "n-95-128-114-60.net.forss.net" }))).guess?.confirmed).toBe(false);
  });
  it("tells the judge the server's name", async () => {
    let seen: string | null = "";
    await guessAgencyByServer(site, fake({ reverseDns: async () => "fore.sitea.se", judge: async (e) => { seen = e.ptr; return null; } }));
    expect(seen).toBe("fore.sitea.se");
  });
  it("answers from memory without a paid lookup or fetching any site", async () => {
    const paid: string[] = [];
    const fetched: string[] = [];
    const row: MemoryRow = { ip: "81.2.3.4", siteCount: 130, verdict: "agency", agencyName: "Sitea", agencyDomain: "sitea.se", evidence: { credited: 8, examples: ["foretagsmassage.se"] }, lookedUpAt: new Date(), confirmedAt: null };
    const r = await guessAgencyByServer(site, fake({ paid, fetched, memory: { get: async () => row, put: async () => {}, lookupsToday: async () => 0 } }));
    expect(r.guess).toMatchObject({ name: "Sitea", cached: true, examples: ["foretagsmassage.se"] });
    expect(paid).toEqual([]);
    expect(fetched).toEqual([]);
  });
  it("does not ask again about a server it recently found to be a plain host", async () => {
    const paid: string[] = [];
    const row: MemoryRow = { ip: "81.2.3.4", siteCount: 300, verdict: "host", agencyName: null, agencyDomain: null, evidence: null, lookedUpAt: new Date(), confirmedAt: null };
    const r = await guessAgencyByServer(site, fake({ paid, memory: { get: async () => row, put: async () => {}, lookupsToday: async () => 0 } }));
    expect(r).toEqual({ guess: null, reason: "cached-no" });
    expect(paid).toEqual([]);
  });
  it("asks again once the memory is old", async () => {
    const paid: string[] = [];
    const old: MemoryRow = { ip: "81.2.3.4", siteCount: 5, verdict: "unclear", agencyName: null, agencyDomain: null, evidence: null, lookedUpAt: new Date(Date.now() - 40 * 86_400_000), confirmedAt: null };
    const r = await guessAgencyByServer(site, fake({ paid, memory: { get: async () => old, put: async () => {}, lookupsToday: async () => 0 } }));
    expect(r.guess?.name).toBe("Sitea");
    expect(paid).toEqual(["81.2.3.4"]);
  });
  it("uses the sites we already know on the server instead of paying for a lookup", async () => {
    const paid: string[] = [];
    const r = await guessAgencyByServer(site, fake({ paid, knownSiblings: async () => Array.from({ length: 60 }, (_, i) => sibling(i)) }));
    expect(r.guess?.name).toBe("Sitea");
    expect(paid).toEqual([]);
  });
  it("takes an agency whose customers on the server we already proved, without any lookup", async () => {
    const paid: string[] = [];
    const r = await guessAgencyByServer(site, fake({ paid, provenAgency: async () => ({ name: "Capace Media", domain: "capace.se", customers: 6 }) }));
    expect(r.guess).toMatchObject({ name: "Capace Media", confirmed: true });
    expect(paid).toEqual([]);
  });
  it("skips a known host, a private address and a missing address", async () => {
    expect(await guessAgencyByServer({ siteDomain: "x.se", ips: ["76.76.21.21"] }, fake())).toEqual({ guess: null, reason: "known-host" });
    expect(await guessAgencyByServer({ siteDomain: "x.se", ips: ["10.0.0.4"] }, fake())).toEqual({ guess: null, reason: "no-ip" });
    expect(await guessAgencyByServer({ siteDomain: "x.se", ips: [] }, fake())).toEqual({ guess: null, reason: "no-ip" });
  });
  it("says nothing for too few sites, and calls too many a web host", async () => {
    const puts: Array<{ verdict: string }> = [];
    const few = await guessAgencyByServer(site, fake({ puts, reverseIp: async () => Array.from({ length: MIN_SITES - 1 }, (_, i) => sibling(i)) }));
    expect(few).toEqual({ guess: null, reason: "too-few" });
    const many = await guessAgencyByServer(site, fake({ puts, reverseIp: async () => Array.from({ length: MAX_SITES + 1 }, (_, i) => sibling(i)) }));
    expect(many).toEqual({ guess: null, reason: "too-many" });
    expect(puts.map((p) => p.verdict)).toEqual(["unclear", "host"]);
  });
  it("does not make a paid lookup past the daily cap", async () => {
    const paid: string[] = [];
    const r = await guessAgencyByServer(site, fake({ paid, memory: { get: async () => null, put: async () => {}, lookupsToday: async () => 9999 } }));
    expect(r).toEqual({ guess: null, reason: "cap" });
    expect(paid).toEqual([]);
  });
  it("finds no agency when the footers name different ones, or none", async () => {
    const r = await guessAgencyByServer(site, fake({ readCredit: async (_h, d) => ({ domain: `byra${d}.se`, name: "En byrå" }) }));
    expect(r).toEqual({ guess: null, reason: "no-credit" });
    expect(await guessAgencyByServer(site, fake({ readCredit: async () => null }))).toEqual({ guess: null, reason: "no-credit" });
  });
  it("does not treat a hosting company or platform that the sites credit as an agency", async () => {
    const puts: Array<{ verdict: string }> = [];
    const r = await guessAgencyByServer(site, fake({ puts, classifyAgency: async () => "hosting" }));
    expect(r).toEqual({ guess: null, reason: "not-agency" });
    expect(puts[0].verdict).toBe("host");
  });
  it("rejects an agency that Claude made up, and falls back to the rules without Claude", async () => {
    expect(await guessAgencyByServer(site, fake({ judge: async () => ({ verdict: "agency", agencyDomain: "uppfunnen.se", confidence: "high", reason: "x" }) }))).toEqual({ guess: null, reason: "unclear" });
    expect((await guessAgencyByServer(site, fake({ judge: async () => null }))).guess?.name).toBe("Sitea");
  });
  it("skips pages drawn by JavaScript, and counts failed pages as unread", async () => {
    const html = `<html><head><script src="/a.js"></script></head><body><div id="root"></div></body></html>`;
    expect(await guessAgencyByServer(site, fake({ fetchHome: async () => html }))).toEqual({ guess: null, reason: "no-credit" });
    expect(await guessAgencyByServer(site, fake({ fetchHome: async () => null }))).toEqual({ guess: null, reason: "no-credit" });
  });
  it("never throws", async () => {
    expect(await guessAgencyByServer(site, fake({ reverseIp: async () => { throw new Error("ViewDNS nere"); } }))).toEqual({ guess: null, reason: "error" });
  });
});

// Sidfoten på en riktig sajt på samma server som abnymalat.se (foretagsmassage.se): kreditraden är bara en länk efter ©-raden.
const FOOTER = `<html><body><main><p>Massage i Örebro. ${"Boka en tid hos oss. ".repeat(20)}</p></main><footer><div class="wpb_text_column"><p style="font-size: 14px;">© Team Lars Massage 2026 – All Rights Reserved. <a style="color: #fff;" href="https://www.sitea.se/digital-marknadsforing/">Sitea – Digital Marknadsbyrå</a></p><p style="font-size: 14px;"><a href="https://www.foretagsmassage.se/cookie-policy-eu/">Cookies</a></p></div></footer></body></html>`;

describe("readCreditFrom", () => {
  it("asks Claude about a footer the rules do not recognise, and takes the agency it points at", async () => {
    const ai = { left: 3 };
    const asked: string[] = [];
    const r = await readCreditFrom(FOOTER, "foretagsmassage.se", ai, async (_h, d) => { asked.push(d); return { role: "agency", domain: "sitea.se", name: "Sitea" }; });
    // Reglerna hittar ingenting i den här sidfoten (kontrollerat mot den riktiga sidan), så det är Claude som pekar ut byrån.
    expect(r).toEqual({ domain: "sitea.se", name: "Sitea" });
    expect(asked).toEqual(["foretagsmassage.se"]);
    expect(ai.left).toBe(2);
  });
  it("does not ask Claude once the budget is spent, and ignores a platform answer", async () => {
    const spent = { left: 0 };
    let asked = 0;
    const ask = async () => { asked++; return { role: "platform" as const, domain: "wix.com", name: "Wix" }; };
    const plain = `<html><body><footer>© 2026 Bageriet AB <a href="https://sajtbyggare.example/">Sajtbyggaren</a></footer></body></html>`;
    expect(await readCreditFrom(plain, "bageriet.se", spent, ask)).toBeNull();
    expect(asked).toBe(0);
    expect(await readCreditFrom(plain, "bageriet.se", { left: 2 }, ask)).toBeNull();
  });
});

describe("registrableDomain and hostSiteCandidates", () => {
  it("strips a server name down to its domain", () => {
    expect(registrableDomain("n-95-128-114-60.net.forss.net")).toBe("forss.net");
    expect(registrableDomain("jizo.oderland.com.")).toBe("oderland.com");
    expect(registrableDomain("host.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("localhost")).toBeNull();
    expect(registrableDomain(null)).toBeNull();
  });
  it("tries the domain itself first, then the same name on the usual endings", () => {
    expect(hostSiteCandidates("forss.net")).toEqual(["forss.net", "forss.se", "forss.com", "forss.nu"]);
    expect(hostSiteCandidates("forss.se")).toEqual(["forss.se", "forss.com", "forss.nu"]);
  });
});

describe("describeHost", () => {
  const forss = `<html><head><title>Forss IT AB - IT-tjänster, datorer, service, bredband &amp; webbyrå</title><meta name="description" content="Erfarenhet från 1998. Datorer &amp; hårdvara."></head><body>Webbhotell och bredband.</body></html>`;
  it("names the company and sees that it calls itself a web agency", () => {
    expect(describeHost(forss, "forss.se")).toEqual({ name: "Forss IT AB", domain: "forss.se", agency: true });
  });
  it("does not count a host that only mentions web agencies in its body text", () => {
    const html = `<html><head><title>Loopia - Webbhotell och domännamn</title><meta name="description" content="Domäner och webbhotell."></head><body>Perfekt för dig som är webbyrå och webbdesigner.</body></html>`;
    expect(describeHost(html, "loopia.se")).toMatchObject({ name: "Loopia", agency: false });
  });
  it("prefers the site name over the title and falls back to the domain", () => {
    expect(describeHost(`<html><head><meta property="og:site_name" content="Bra Webbyrå AB"><title>Startsida | Bra</title></head></html>`, "brabyra.se")).toMatchObject({ name: "Bra Webbyrå AB", agency: true });
    expect(describeHost(`<html><body>hej</body></html>`, "okand.se")).toMatchObject({ name: "Okand", agency: false });
  });
});

describe("guessAgencyByServer: the server's owner is a web agency", () => {
  const forss = { name: "Forss IT AB", domain: "forss.se", agency: true };
  const ptr = "n-95-128-114-60.net.forss.net";
  const none = { readCredit: async () => null };

  it("names the owner of the server as a possible agency when the footers name nobody", async () => {
    const puts: Array<{ verdict: string; evidence: { via?: string } }> = [];
    const r = await guessAgencyByServer(site, fake({ ...none, puts: puts as unknown[], reverseDns: async () => ptr, inspectHost: async () => forss }));
    expect(r.guess).toMatchObject({ name: "Forss IT AB", domain: "forss.se", via: "host", confirmed: false, sites: 130 });
    expect(puts[0]).toMatchObject({ verdict: "agency", evidence: { via: "host" } });
  });
  it("also does so when the footers only name a platform or a different agency too rarely", async () => {
    const r = await guessAgencyByServer(site, fake({ readCredit: async (_h, d) => (Number(d.match(/\d+/)![0]) % 40 === 0 ? sitea : null), reverseDns: async () => ptr, inspectHost: async () => forss }));
    expect(r.guess).toMatchObject({ domain: "forss.se", via: "host" });
  });
  it("shows how many sites credit the owner when some do", async () => {
    const r = await guessAgencyByServer(site, fake({ readCredit: async (_h, d) => (Number(d.match(/\d+/)![0]) % 40 === 0 ? { domain: "forss.se", name: "Forss" } : null), reverseDns: async () => ptr, inspectHost: async () => forss }));
    expect(r.guess?.via).toBe("host");
    expect(r.guess!.credited).toBeGreaterThan(0);
    expect(r.guess!.examples.length).toBeGreaterThan(0);
  });
  it("says nothing when the owner is not a web agency, or the server has no name, or the owner is the site itself", async () => {
    expect((await guessAgencyByServer(site, fake({ ...none, reverseDns: async () => ptr, inspectHost: async () => ({ name: "Loopia", domain: "loopia.se", agency: false }) }))).guess).toBeNull();
    expect((await guessAgencyByServer(site, fake({ ...none, reverseDns: async () => null, inspectHost: async () => forss }))).guess).toBeNull();
    expect((await guessAgencyByServer({ siteDomain: "forss.se", ips: ["81.2.3.4"] }, fake({ ...none, reverseDns: async () => ptr, inspectHost: async () => forss }))).guess).toBeNull();
  });
  it("prefers the agency the footers name over the server's owner", async () => {
    const r = await guessAgencyByServer(site, fake({ reverseDns: async () => ptr, inspectHost: async () => forss }));
    expect(r.guess).toMatchObject({ domain: "sitea.se", via: "credits" });
  });
  it("asks again about an old 'unclear' answer that was given before the owner was looked at", async () => {
    const old: MemoryRow = { ip: "81.2.3.4", siteCount: 113, verdict: "unclear", agencyName: null, agencyDomain: null, evidence: { read: 17 }, lookedUpAt: new Date(), confirmedAt: null };
    const r = await guessAgencyByServer(site, fake({ ...none, memory: { get: async () => old, put: async () => {}, lookupsToday: async () => 0 }, reverseDns: async () => ptr, inspectHost: async () => forss }));
    expect(r.guess?.domain).toBe("forss.se");
    const checked: MemoryRow = { ...old, evidence: { read: 17, hostChecked: true } };
    expect(await guessAgencyByServer(site, fake({ ...none, memory: { get: async () => checked, put: async () => {}, lookupsToday: async () => 0 }, inspectHost: async () => forss }))).toEqual({ guess: null, reason: "cached-no" });
  });
  it("remembers the owner guess and answers from memory the next time", async () => {
    const row: MemoryRow = { ip: "81.2.3.4", siteCount: 113, verdict: "agency", agencyName: "Forss IT AB", agencyDomain: "forss.se", evidence: { via: "host", hostChecked: true, credited: 0 }, lookedUpAt: new Date(), confirmedAt: null };
    const paid: string[] = [];
    const r = await guessAgencyByServer(site, fake({ paid, memory: { get: async () => row, put: async () => {}, lookupsToday: async () => 0 } }));
    expect(r.guess).toMatchObject({ name: "Forss IT AB", via: "host", cached: true });
    expect(paid).toEqual([]);
  });
});
