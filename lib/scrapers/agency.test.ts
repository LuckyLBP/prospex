import { describe, expect, it, vi } from "vitest";
import type { Candidate } from "@/lib/agencies/discover";
import type { CheckedRow } from "@/lib/agencies/store";
import { VERIFY_RULES, type Verdict } from "@/lib/agencies/verify";
import { createAgencyCollector, FRESH_BATCH, planSameServer, summary, type AgencyDeps } from "./agency";
import type { CollectBatch, CollectContext, Json } from "./types";

const config = { agencyName: "Conseo Webb", domain: "conseo.se", maxCandidates: 3000, useViewdns: true, useClaude: true };
const ctx = (cursor: Json | null = null): CollectContext => ({ profile: { id: "s1", slug: "conseo", name: "Conseo", method: "agency", config, enrich_sites: true }, runId: "r1", cursor, signal: new AbortController().signal, log: () => {} });
const accept = (domain: string): Verdict => ({ accepted: true, confidence: "credit", evidenceUrl: `https://${domain}/`, evidence: "Sidfoten anger Conseo Webb" });
const reject = (reason: "no-credit" | "blocked" | "unreachable"): Verdict => ({ accepted: false, reason });

interface Harness extends AgencyDeps {
  store: Map<string, CheckedRow>;
  lost: { domain: string; kind: string; to: string | null }[];
  existingDomains: string[];
}

function harness(domains: string[], verify: AgencyDeps["verify"], over: Partial<AgencyDeps> = {}): Harness {
  const store = new Map<string, CheckedRow>();
  const lost: Harness["lost"] = [];
  const h: Harness = {
    store, lost, existingDomains: [],
    discover: {
      catalog: async () => [], viewdns: async () => [], viewdnsConfigured: () => false, claude: async () => [], claudeConfigured: () => false,
      publicwww: async () => ({ domains: domains.map((domain) => ({ domain, url: null })), truncated: false }),
      backlinks: async () => ({ candidates: [], total: 0, credits: null, dropped: 0 }), backlinksConfigured: () => false, site: async () => [],
    },
    rejected: async () => new Set(),
    verify,
    fetchProof: async () => null,
    existing: async () => h.existingDomains,
    checked: async () => new Map(store),
    proven: async () => new Map(),
    serverCustomers: async () => [],
    onServer: async () => true,
    record: async (_id, rows) => { for (const r of rows) store.set(r.domain, { verdict: r.verdict, misses: r.misses, checkedAt: new Date(NOW), rules: VERIFY_RULES }); },
    markLost: async (_id, domain, kind, to) => { lost.push({ domain, kind, to }); return true; },
    spend: async () => ({ credits: 0, costSek: 0 }),
    now: () => NOW,
    pause: async () => {},
    ...over,
  };
  return h;
}
const NOW = Date.parse("2026-10-12T10:00:00Z");

/** Kör en hel körning: omgångarna efter varandra, med markören vidare tills den är slut. */
async function runAll(c: ReturnType<typeof createAgencyCollector>, maxLegs = 60): Promise<{ batches: CollectBatch[]; legs: number }> {
  const batches: CollectBatch[] = [];
  let cursor: Json | null = null;
  for (let leg = 1; leg <= maxLegs; leg++) {
    let last: CollectBatch | null = null;
    for await (const b of c.collect(c.parseConfig(config), ctx(cursor))) { batches.push(b); last = b; }
    cursor = last?.cursor ?? null;
    if (cursor === null) return { batches, legs: leg };
  }
  throw new Error("körningen tog aldrig slut");
}
const itemsOf = (bs: CollectBatch[]) => bs.flatMap((b) => b.items);

describe("agency collector", () => {
  it("emits only the candidates that verify, with the proof attached", async () => {
    const c = createAgencyCollector(harness(["a.se", "b.se", "c.se"], async (d) => (d === "b.se" ? reject("no-credit") : accept(d))));
    const { batches } = await runAll(c);
    const items = itemsOf(batches);
    expect(items.map((i) => i.domain)).toEqual(["a.se", "c.se"]);
    expect(items[0]).toMatchObject({ sourceUrl: "https://a.se/", raw: { confidence: "credit", via: "publicwww", agency: "conseo.se" } });
    expect(batches.at(-1)!.cursor).toBeNull();
  });

  it("steps through discovery one source at a time, writing the cursor between steps so a leg can stop and resume", async () => {
    const c = createAgencyCollector(harness(["a.se"], async (d) => accept(d)));
    const first: CollectBatch[] = [];
    for await (const b of c.collect(c.parseConfig(config), ctx())) { first.push(b); if (first.length === 2) break; }
    expect(first.map((b) => (b.cursor as { stage?: string } | null)?.stage)).toEqual(["discover", "discover"]);
    expect(first.every((b) => b.items.length === 0)).toBe(true);
    // Fortsätter från markören utan att börja om, och hittar ändå kunden.
    const resumed: CollectBatch[] = [];
    for await (const b of c.collect(c.parseConfig(config), ctx(first[1].cursor))) resumed.push(b);
    expect(itemsOf(resumed).map((i) => i.domain)).toEqual(["a.se"]);
  });

  it("verifies in batches and resumes mid-verification from the cursor", async () => {
    const verify = vi.fn(async (d: string, _a?: unknown, _p?: unknown, _h?: unknown) => accept(d));
    const domains = Array.from({ length: 90 }, (_, i) => `k${i}.se`);
    const h = harness(domains, verify);
    const c = createAgencyCollector(h);
    const gen = c.collect(c.parseConfig(config), ctx());
    let cursor: Json | null = null;
    for await (const b of gen) { cursor = b.cursor; if (b.items.length > 0) break; }
    expect(verify.mock.calls.length).toBe(40);
    const rest: CollectBatch[] = [];
    for await (const b of c.collect(c.parseConfig(config), ctx(cursor))) rest.push(b);
    expect(verify.mock.calls.length).toBe(90);
    expect(itemsOf(rest)).toHaveLength(50);
  });

  it("checks at most one batch of new candidates per run, and the next run carries on with the rest", async () => {
    const domains = Array.from({ length: FRESH_BATCH + 150 }, (_, i) => `k${i}.se`);
    const verify = vi.fn(async (d: string, _a?: unknown, _p?: unknown, _h?: unknown) => (Number(d.slice(1, -3)) % 2 === 0 ? accept(d) : reject("no-credit")));
    const h = harness(domains, verify);
    const first = await runAll(createAgencyCollector(h));
    expect(verify).toHaveBeenCalledTimes(FRESH_BATCH);
    expect(first.batches.find((b) => b.note?.includes("väntar till nästa körning"))?.note).toContain("150 väntar");
    expect(first.batches.some((b) => b.truncated)).toBe(true);
    // Andra körningen: de redan kontrollerade hoppas över (godkända är befintliga kunder, resten kontrollerades nyss).
    h.existingDomains = itemsOf(first.batches).map((i) => i.domain!);
    verify.mockClear();
    const second = await runAll(createAgencyCollector(h));
    const checkedNow = verify.mock.calls.map((c) => c[0]);
    expect(checkedNow.filter((d) => !h.existingDomains.includes(d))).toHaveLength(150);
    expect(checkedNow).not.toContain("k1.se");
    expect(itemsOf(second.batches).length).toBeGreaterThan(0);
  });

  it("re-checks existing customers: an accepted one is left alone, a missing credit counts, two in a row removes the customer", async () => {
    const verify = vi.fn(async (d: string, _a?: unknown, _p?: unknown, _h?: unknown): Promise<Verdict> => (d === "kvar.se" ? accept(d) : reject("no-credit")));
    const h = harness([], verify);
    h.existingDomains = ["kvar.se", "borta.se"];
    h.discover.catalog = async () => ["kvar.se", "borta.se"];
    const one = await runAll(createAgencyCollector(h));
    expect(itemsOf(one.batches)).toEqual([]);
    expect(h.lost).toEqual([]);
    expect(h.store.get("borta.se")).toMatchObject({ verdict: "no-credit", misses: 1 });
    expect(h.store.get("kvar.se")).toMatchObject({ verdict: "accepted", misses: 0 });
    await runAll(createAgencyCollector(h));
    expect(h.lost).toEqual([{ domain: "borta.se", kind: "lost", to: null }]);
  });

  it("notes a switch when the site now credits another agency, and never changes anything for an unreadable site", async () => {
    const verify = vi.fn(async (d: string, _a?: unknown, _p?: unknown, _h?: unknown): Promise<Verdict> => (d === "bytte.se" ? { accepted: false, reason: "other-agency", to: "Infront Media" } : reject("blocked")));
    const h = harness([], verify);
    h.existingDomains = ["bytte.se", "blockerad.se"];
    h.store.set("bytte.se", { verdict: "no-credit", misses: 1, checkedAt: new Date(NOW - 7 * 86_400_000), rules: VERIFY_RULES });
    h.store.set("blockerad.se", { verdict: "no-credit", misses: 1, checkedAt: new Date(NOW - 7 * 86_400_000), rules: VERIFY_RULES });
    await runAll(createAgencyCollector(h));
    expect(h.lost).toEqual([{ domain: "bytte.se", kind: "switched", to: "Infront Media" }]);
    expect(h.store.get("blockerad.se")).toMatchObject({ verdict: "blocked", misses: 1 });
  });

  it("reports what it checked, per batch and as a summary note at the end", async () => {
    const verify = async (d: string): Promise<Verdict> => (d.startsWith("a") ? accept(d) : d.startsWith("b") ? reject("blocked") : reject("no-credit"));
    const { batches } = await runAll(createAgencyCollector(harness(["a1.se", "a2.se", "b1.se", "c1.se", "c2.se"], verify)));
    const total = batches.reduce((n, b) => n + (b.stats?.checked ?? 0), 0);
    expect(total).toBe(5);
    expect(batches.at(-1)!.note).toBe("Kontrollerade 5: 2 godkända, 2 utan kredit, 1 blockerade.");
  });

  it("reports what discovery cost, step by step", async () => {
    const h = harness(["a.se"], async (d) => accept(d));
    h.discover.backlinksConfigured = () => true;
    h.discover.backlinks = async () => ({ candidates: [], total: 0, credits: 9000, dropped: 0, creditsUsed: 90 });
    const { batches } = await runAll(createAgencyCollector(h));
    expect(batches.reduce((n, b) => n + (b.usage?.credits ?? 0), 0)).toBe(90);
  });

  it("hands the backlink hint to the check and keeps it with the proof", async () => {
    const verify = vi.fn(async (d: string, _a?: unknown, _p?: unknown, _h?: unknown): Promise<Verdict> => accept(d));
    const h = harness([], verify);
    h.discover.backlinksConfigured = () => true;
    h.discover.backlinks = async () => ({ candidates: [{ domain: "bl.se", urlFrom: "https://bl.se/om", anchor: "Capace Media", strength: "name", partner: false }], total: 1, credits: 5000, dropped: 0 });
    const { batches } = await runAll(createAgencyCollector(h));
    expect(verify.mock.calls[0][3]).toEqual({ urlFrom: "https://bl.se/om", anchor: "Capace Media" });
    expect(itemsOf(batches)[0].raw).toMatchObject({ via: "backlinks", anchor: "Capace Media", urlFrom: "https://bl.se/om" });
  });

  it("fetches each of the agency's evidence pages once and hands it to the check as proof", async () => {
    const fetchProof = vi.fn(async () => "<a href='https://a.se'>A</a><a href='https://b.se'>B</a>");
    const verify = vi.fn(async (d: string, _a?: unknown, _p?: unknown, _h?: unknown): Promise<Verdict> => accept(d));
    const h = harness([], verify, { fetchProof });
    h.discover.claudeConfigured = () => true;
    h.discover.claude = async () => ["a.se", "b.se"].map((domain) => ({ domain, evidenceUrl: "https://conseo.se/kunder", evidenceQuote: null }));
    const { batches } = await runAll(createAgencyCollector(h));
    expect(fetchProof).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][2]).toEqual({ url: "https://conseo.se/kunder", html: expect.stringContaining("a.se") });
    expect(itemsOf(batches).map((i) => i.domain)).toEqual(["a.se", "b.se"]);
  });

  it("treats a failing check as unreachable, and ends at once when there is nothing to check", async () => {
    const failing = await runAll(createAgencyCollector(harness(["a.se"], async () => { throw new Error("nere"); })));
    expect(itemsOf(failing.batches)).toEqual([]);
    expect(failing.batches.at(-1)!.note).toContain("1 svarade inte");
    const h = harness([], async (d) => accept(d));
    h.discover.publicwww = async () => { throw new Error("kvoten är slut"); };
    await expect(runAll(createAgencyCollector(h))).rejects.toThrow(/Ingen källa.*PublicWWW hoppades över: kvoten är slut/);
    const empty = await runAll(createAgencyCollector(harness([], async (d) => accept(d))));
    expect(itemsOf(empty.batches)).toEqual([]);
  });

  it("refuses a config without a usable domain", () => {
    expect(() => createAgencyCollector().parseConfig({ agencyName: "X", domain: "inte en domän" })).toThrow();
  });

  it("understands the cursor an older run left behind", async () => {
    const queue: Candidate[] = [{ domain: "a.se", via: "publicwww", sourceUrl: null }];
    const c = createAgencyCollector(harness([], async (d) => accept(d)));
    const out: CollectBatch[] = [];
    for await (const b of c.collect(c.parseConfig(config), ctx({ candidates: queue, index: 0 } as unknown as Json))) out.push(b);
    expect(itemsOf(out).map((i) => i.domain)).toEqual(["a.se"]);
  });
});

describe("same server", () => {
  const server = { ip: "172.105.250.144", size: 35 };
  const contact = (domain: string): Verdict => ({ accepted: true, confidence: "contact", evidenceUrl: `https://${domain}/`, evidence: "Sidan länkar till e-postadressen offert@conseo.se" });

  it("plans only sites without credit on a small server that two proven sites share", () => {
    const queue: Candidate[] = [
      { domain: "ok.se", via: "viewdns", sourceUrl: null, server },
      { domain: "stor.se", via: "viewdns", sourceUrl: null, server: { ip: "1.1.1.1", size: 61 } },
      { domain: "okand.se", via: "viewdns", sourceUrl: null, server: { ip: "2.2.2.2", size: 10 } },
      { domain: "annan.se", via: "viewdns", sourceUrl: null, server },
      { domain: "utan.se", via: "viewdns", sourceUrl: null },
      { domain: "kund.se", via: "known", sourceUrl: null, server },
    ];
    const proven = new Map([[server.ip, 2], ["1.1.1.1", 5], ["2.2.2.2", 1]]);
    const plan = planSameServer({ queue, noCredit: new Set(["ok.se", "stor.se", "okand.se", "utan.se", "kund.se"]), proven });
    expect(plan).toEqual([{ domain: "ok.se", ip: server.ip, proof: 2, via: "viewdns" }]);
  });

  it("accepts a no-credit site that still sits on a server two proven sites share, and keeps the server in the proof", async () => {
    const verify = async (d: string): Promise<Verdict> => (d === "a.se" || d === "b.se" ? contact(d) : d === "d.se" ? reject("blocked") : reject("no-credit"));
    const h = harness([], verify);
    h.discover.viewdnsConfigured = () => true;
    h.discover.viewdns = async () => ["a.se", "b.se", "c.se", "d.se"].map((domain) => ({ domain, server }));
    const items = itemsOf((await runAll(createAgencyCollector(h))).batches);
    expect(items.map((i) => [i.domain, (i.raw as { confidence: string }).confidence])).toEqual([["a.se", "contact"], ["b.se", "contact"], ["c.se", "same-server"]]);
    expect(items[2].raw).toMatchObject({ server: server.ip, evidence: expect.stringContaining("2 sajter") });
    expect(h.store.get("c.se")).toMatchObject({ verdict: "accepted" });
  });

  it("does not accept it once it has left the server, or when only one site has proof", async () => {
    const verify = async (d: string): Promise<Verdict> => (d === "a.se" ? contact(d) : reject("no-credit"));
    const h = harness([], verify, { onServer: async () => false });
    h.discover.viewdnsConfigured = () => true;
    h.discover.viewdns = async () => ["a.se", "b.se"].map((domain) => ({ domain, server }));
    expect(itemsOf((await runAll(createAgencyCollector(h))).batches).map((i) => i.domain)).toEqual(["a.se"]);
  });

  it("removes a same-server customer when its server no longer has two proven sites, and rechecks the rest by server, not by footer", async () => {
    const verify = vi.fn(async (): Promise<Verdict> => reject("no-credit"));
    const h = harness([], verify, { serverCustomers: async () => [{ domain: "x.se", ip: server.ip }, { domain: "y.se", ip: "9.9.9.9" }], proven: async () => new Map([[server.ip, 2]]) });
    h.existingDomains = ["x.se", "y.se"];
    h.discover.catalog = async () => ["z.se"];
    await runAll(createAgencyCollector(h));
    expect(verify).not.toHaveBeenCalledWith("x.se", expect.anything(), expect.anything(), expect.anything());
    expect(h.lost).toEqual([{ domain: "y.se", kind: "lost", to: null }]);
  });
});

describe("summary", () => {
  it("lists the reasons, largest first, and the customers that stopped showing the agency", () => {
    expect(summary({ checked: 10, accepted: 6, lost: 1, rejected: { "no-credit": 2, unreachable: 1, "other-agency": 1 } })).toBe("Kontrollerade 10: 6 godkända, 2 utan kredit, 1 svarade inte, 1 annan byrå, 1 kunder har slutat visa byrån.");
  });
});

describe("learning from fingerprints", () => {
  it("keeps the code trace that proved a customer, so it can be searched for later", async () => {
    const traced: Verdict = { accepted: true, confidence: "fingerprint", evidenceUrl: "https://a.se/", evidence: "Kod: conseo_design_data", trace: { kind: "identifier", token: "conseo_design_data" } };
    const h = harness(["a.se"], async () => traced);
    const { batches } = await runAll(createAgencyCollector(h));
    const item = batches.flatMap((b) => b.items).find((i) => i.domain === "a.se");
    expect(item?.raw).toMatchObject({ confidence: "fingerprint", trace: { kind: "identifier", token: "conseo_design_data" } });
  });
  it("gives the traces it has learned to discovery", async () => {
    const seen: unknown[] = [];
    const h = harness(["a.se"], async (d) => accept(d), { learned: async () => ["conseo_design_data"] });
    h.discover.publicwww = async (_a, _c, learned) => { seen.push(learned); return { domains: [], truncated: false }; };
    await runAll(createAgencyCollector(h));
    expect(seen).toEqual([["conseo_design_data"]]);
  });
});
