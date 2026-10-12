import { describe, expect, it } from "vitest";
import { fetchPageForModel, type AgentContext } from "./agent";
import { FactBook } from "./facts";
import { PageBudget, type SafePage } from "./safe-fetch";

const html = (body: string, head = "") => `<html><head><title>T</title>${head}</head><body>${body}</body></html>`;
const ok = (url: string, h: string): SafePage => ({ url, finalUrl: url, status: 200, html: h, headers: {}, problem: null });

function ctx(over: Partial<Omit<AgentContext, "pages">> & { sites?: Record<string, SafePage> } = {}): AgentContext & { fetched: string[] } {
  const fetched: string[] = [];
  const sites = over.sites ?? {};
  const book = over.book ?? FactBook.from([{ id: "F1", kind: "page", label: "Startsidan hämtades", value: "https://x.se", source: "https://x.se", detector: "page:home" }]);
  return {
    book,
    texts: over.texts ?? [{ id: "F1", url: "https://x.se", text: "Start" }],
    pages: [],
    inventory: over.inventory ?? [{ url: "https://x.se/tjanster", text: "Tjänster" }, { url: "https://x.se/om-oss/", text: "Om oss" }],
    boundary: "x.se",
    budget: over.budget ?? new PageBudget(),
    safeFetch: (async (url: string, _b: string, budget: PageBudget, via: "code" | "model") => {
      fetched.push(url);
      if (!budget.take(via)) return { url, finalUrl: url, status: 0, html: null, headers: {}, problem: "Gränsen för antal sidor är nådd." };
      return sites[url] ?? { url, finalUrl: url, status: 404, html: null, headers: {}, problem: "Webbplatsen svarade 404." };
    }) as never,
    fetched,
  } as AgentContext & { fetched: string[] };
}

describe("fetchPageForModel", () => {
  it("fetches a page from the inventory, gives it a fact id, and reports new tech it found", async () => {
    const c = ctx({ sites: { "https://x.se/tjanster": ok("https://x.se/tjanster", html("Vi gör el.", `<script src="https://js.stripe.com/v3/"></script>`)) } });
    const r = await fetchPageForModel(c, { url: "https://x.se/tjanster", skal: "tjänster" });
    expect(r).toMatchObject({ ok: true, id: "F2", url: "https://x.se/tjanster", text: expect.stringContaining("Vi gör el") });
    expect(r.ok && r.nyaFakta).toEqual([{ id: "F3", label: "Stripe" }]);
    expect(c.texts.map((t) => t.id)).toEqual(["F1", "F2"]);
    expect(c.pages[0]).toMatchObject({ via: "model", status: 200 });
    expect(c.budget.byModel).toBe(1);
  });
  it("matches the inventory regardless of trailing slash, fragment and case", async () => {
    const c = ctx({ sites: { "https://x.se/om-oss/": ok("https://x.se/om-oss/", html("Om")) } });
    expect((await fetchPageForModel(c, { url: "https://X.se/om-oss#team", skal: "" })).ok).toBe(true);
  });
  it("refuses anything that is not a link from the inventory, without fetching", async () => {
    const c = ctx();
    for (const url of ["https://x.se/hemlig", "https://evil.com/", "http://169.254.169.254/", "file:///etc/passwd", "/tjanster", ""]) {
      const r = await fetchPageForModel(c, { url, skal: "" });
      expect(r, url).toMatchObject({ ok: false, message: expect.stringContaining("bland de sidor") });
    }
    expect(c.fetched).toEqual([]);
    expect(c.budget.used).toBe(0);
  });
  it("refuses a page the model already has", async () => {
    const c = ctx({ texts: [{ id: "F1", url: "https://x.se/tjanster", text: "x" }] });
    expect(await fetchPageForModel(c, { url: "https://x.se/tjanster", skal: "" })).toMatchObject({ ok: false, message: "Du har redan den sidan." });
    expect(c.fetched).toEqual([]);
  });
  it("stops at four pages chosen by the model", async () => {
    const inventory = [1, 2, 3, 4, 5].map((n) => ({ url: `https://x.se/p${n}`, text: "" }));
    const pages = Object.fromEntries(inventory.map((l) => [l.url, ok(l.url, html("ok " + l.url))]));
    const c = ctx({ inventory, sites: pages });
    const results = [];
    for (const l of inventory) results.push(await fetchPageForModel(c, { url: l.url, skal: "" }));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, true, false]);
    expect(results[4]).toMatchObject({ message: "Gränsen för antal sidor är nådd." });
  });
  it("reports a page that does not load, and a robot check, as plain refusals", async () => {
    const challenge = `<html><head><meta http-equiv="refresh" content="0;url=/sgcaptcha"></head><body></body></html>`;
    const c = ctx({ sites: { "https://x.se/om-oss/": ok("https://x.se/om-oss/", challenge) } });
    expect(await fetchPageForModel(c, { url: "https://x.se/tjanster", skal: "" })).toMatchObject({ ok: false, message: "Webbplatsen svarade 404." });
    expect(await fetchPageForModel(c, { url: "https://x.se/om-oss/", skal: "" })).toMatchObject({ ok: false, message: "Sidan svarade med en robotkontroll." });
    expect(c.texts).toHaveLength(1);
  });
  it("caps the text it hands back", async () => {
    const c = ctx({ sites: { "https://x.se/tjanster": ok("https://x.se/tjanster", html("ord ".repeat(5000))) } });
    const r = await fetchPageForModel(c, { url: "https://x.se/tjanster", skal: "" });
    expect(r.ok && r.text.length).toBeLessThanOrEqual(6000);
  });
});

// ---------------------------------------------------------------- runAgent: försök och reparation

import { NoObjectGeneratedError } from "ai";
import { afterEach, beforeEach, vi } from "vitest";
import { recoverOutput, runAgent } from "./agent";

const GOOD = { summary: "Ett elbolag.", offering: [{ text: "Elinstallation.", evidence: ["F1"] }], audience: null, services: [], observations: [], talkingPoints: [] };
const usage = (i: number, o: number) => ({ inputTokens: i, outputTokens: o, totalTokens: i + o });
const answer = (output: unknown, i = 1000, o = 200) => ({ output, totalUsage: usage(i, o), steps: [{}, {}] });
const broken = (text: string, i = 900, o = 100) => new NoObjectGeneratedError({ message: "x", text, response: {} as never, usage: usage(i, o) as never, finishReason: "stop" });

beforeEach(() => vi.stubEnv("DEEPSEEK_API_KEY", "test-key"));
afterEach(() => vi.unstubAllEnvs());

const base = () => ({ company: { name: "X AB", orgnr: null, domain: "x.se" }, ctx: ctx() });

describe("runAgent", () => {
  it("returns the model's object with token and step totals", async () => {
    const generate = (async () => answer(GOOD)) as never;
    expect(await runAgent({ ...base(), generate })).toEqual({ output: GOOD, inputTokens: 1000, outputTokens: 200, steps: 2, model: "deepseek/deepseek-v4-flash" });
  });
  it("uses the model it is given (an agency's profile is written by Claude) and reports that model", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL", "");
    const calls: unknown[] = [];
    const generate = (async (opts: unknown) => { calls.push(opts); return answer(GOOD); }) as never;
    const choice = { id: "claude-sonnet-5-5", model: "stub-model" as never };
    const r = await runAgent({ ...base(), generate, modelChoice: choice });
    expect(r.model).toBe("claude-sonnet-5-5");
    expect((calls[0] as { model: unknown }).model).toBe("stub-model");
  });
  it("repairs a stray closing brace instead of calling the model again", async () => {
    const stray = JSON.stringify(GOOD).replace(/,"observations":\[\],"talkingPoints":\[\]\}$/, "},\"observations\":[],\"talkingPoints\":[]}");
    let calls = 0;
    const generate = (async () => { calls++; throw broken(stray); }) as never;
    const r = await runAgent({ ...base(), generate });
    expect(calls).toBe(1);
    expect(r.output).toEqual(GOOD);
    expect(r.inputTokens).toBe(900);
  });
  it("tries once more when the answer cannot be repaired, and adds up the tokens", async () => {
    let calls = 0;
    const generate = (async () => { calls++; if (calls === 1) throw broken("det här är inte json"); return answer(GOOD, 1000, 200); }) as never;
    const r = await runAgent({ ...base(), generate });
    expect(calls).toBe(2);
    expect(r).toMatchObject({ output: GOOD, inputTokens: 1900, outputTokens: 300 });
  });
  it("gives up after the second failure when the answer is not an object at all", async () => {
    let calls = 0;
    const generate = (async () => { calls++; throw broken("[1, 2, 3]"); }) as never;
    await expect(runAgent({ ...base(), generate })).rejects.toBeInstanceOf(NoObjectGeneratedError);
    expect(calls).toBe(2);
  });
  it("does not retry other errors, or when the request was aborted", async () => {
    let calls = 0;
    await expect(runAgent({ ...base(), generate: (async () => { calls++; throw new Error("nätverk"); }) as never })).rejects.toThrow("nätverk");
    expect(calls).toBe(1);
    const controller = new AbortController();
    controller.abort();
    let aborted = 0;
    await expect(runAgent({ ...base(), signal: controller.signal, generate: (async () => { aborted++; throw broken("nej"); }) as never })).rejects.toBeInstanceOf(NoObjectGeneratedError);
    expect(aborted).toBe(1);
  });
  it("refuses to run without an AI key", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    await expect(runAgent({ ...base(), generate: (async () => answer(GOOD)) as never })).rejects.toThrow("AI är inte konfigurerat");
  });
});

describe("recoverOutput: a wrong shape", () => {
  it("accepts an answer whose audience is a list, instead of retrying", () => {
    const shaped = JSON.stringify({ summary: "Verkstad.", offering: [{ text: "Service.", evidence: ["F7"] }], audience: [{ text: "Bilägare.", evidence: ["F7"] }], services: [], observations: [] });
    expect(recoverOutput(broken(shaped))).toMatchObject({ audience: { text: "Bilägare.", evidence: ["F7"] } });
  });
});

describe("recoverOutput", () => {
  it("ignores errors that are not about a missing object", () => {
    expect(recoverOutput(new Error("x"))).toBeNull();
    expect(recoverOutput(broken(""))).toBeNull();
  });
});
