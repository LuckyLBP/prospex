import { describe, expect, it, vi } from "vitest";
import { fetchBacklinks, creditsRemaining, rowsOf, MIN_CREDITS, type OpenSeoDeps } from "./openseo";

const row = (domainFrom: string) => ({ domainFrom, urlFrom: `https://${domainFrom}/`, urlTo: "https://capace.se/", anchor: "Capace Media", itemType: "anchor", spamScore: 0 });
const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result }) }) as Response;

function deps(handler: (name: string, args: Record<string, unknown>) => unknown): OpenSeoDeps & { calls: { name: string; args: Record<string, unknown> }[] } {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  return {
    apiKey: "oseo_test", projectId: "p1", calls,
    fetch: vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { params: { name: string; arguments: Record<string, unknown> } };
      calls.push({ name: body.params.name, args: body.params.arguments });
      return reply(handler(body.params.name, body.params.arguments));
    }) as unknown as typeof fetch,
  };
}
const whoami = (n: number) => ({ structuredContent: { creditsRemaining: n } });
const page = (rows: unknown[], hasMore: boolean, credits = 9000) => ({ structuredContent: { backlinks: { rows, totalCount: 3, hasMore } }, _meta: { creditsRemaining: credits } });

describe("rowsOf", () => {
  it("reads structured content, or JSON text, and drops malformed rows", () => {
    expect(rowsOf({ structuredContent: { backlinks: { rows: [row("a.se"), { nope: 1 }], totalCount: 9, hasMore: true } } })).toMatchObject({ total: 9, hasMore: true, rows: [{ domainFrom: "a.se" }] });
    expect(rowsOf({ content: [{ type: "text", text: JSON.stringify({ backlinks: { rows: [row("b.se")], totalCount: 1 } }) }] }).rows).toHaveLength(1);
    expect(rowsOf({})).toEqual({ rows: [], total: 0, hasMore: false });
  });
});

describe("fetchBacklinks", () => {
  it("pages through the results with the project, the domain and the no-spam filter", async () => {
    const d = deps((name, args) => (name === "whoami" ? whoami(10_000) : args.page === 1 ? page([row("a.se"), row("b.se")], true, 9970) : page([row("c.se")], false, 9940)));
    const r = await fetchBacklinks("capace.se", {}, d);
    expect(r.rows.map((x) => x.domainFrom)).toEqual(["a.se", "b.se", "c.se"]);
    expect(r).toMatchObject({ pages: 2, creditsLeft: 9940 });
    const first = d.calls.find((c) => c.name === "get_backlinks_profile")!;
    expect(first.args).toMatchObject({ projectId: "p1", target: "capace.se", mode: "one_per_domain", hideSpam: true, page: 1 });
  });
  it("stops at the page limit", async () => {
    const d = deps((name) => (name === "whoami" ? whoami(10_000) : page([row("a.se")], true, 9970)));
    expect((await fetchBacklinks("capace.se", { maxPages: 2 }, d)).pages).toBe(2);
  });
  it("stops when the credit budget is used, and says there was more", async () => {
    let credits = 10_000;
    const d = deps((name) => { if (name === "whoami") return whoami(credits); credits -= 30; return page([row(`d${credits}.se`)], true, credits); });
    const r = await fetchBacklinks("capace.se", { budget: 60 }, d);
    expect(r).toMatchObject({ pages: 2, creditsUsed: 60, more: true });
  });
  it("refuses to start when the budget cannot pay for a page, and never goes below the reserve", async () => {
    await expect(fetchBacklinks("capace.se", { budget: 10 }, deps(() => whoami(10_000)))).rejects.toThrow("tak");
    let credits = MIN_CREDITS + 40;
    const d = deps((name) => { if (name === "whoami") return whoami(credits); credits -= 30; return page([row("a.se")], true, credits); });
    const r = await fetchBacklinks("capace.se", { budget: 450 }, d);
    expect(r.creditsLeft).toBeGreaterThanOrEqual(MIN_CREDITS);
    expect(r.more).toBe(true);
  });
  it("skips the call when credits are low, without spending any", async () => {
    const d = deps(() => whoami(MIN_CREDITS - 1));
    await expect(fetchBacklinks("capace.se", {}, d)).rejects.toThrow(/krediter kvar/);
    expect(d.calls.map((c) => c.name)).toEqual(["whoami"]);
  });
  it("explains a missing key, a refused key and a failing call in Swedish", async () => {
    await expect(fetchBacklinks("capace.se", {}, { fetch, apiKey: undefined, projectId: undefined })).rejects.toThrow("inte konfigurerat");
    const refused = { fetch: (async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response) as typeof fetch, apiKey: "x", projectId: "p" };
    await expect(fetchBacklinks("capace.se", {}, refused)).rejects.toThrow("nekade nyckeln");
    const tool = deps((name) => (name === "whoami" ? whoami(10_000) : { isError: true, content: [{ type: "text", text: "Projektet finns inte" }] }));
    await expect(fetchBacklinks("capace.se", {}, tool)).rejects.toThrow("Projektet finns inte");
  });
});

describe("creditsRemaining", () => {
  it("reads the balance and gives null when it cannot", async () => {
    expect(await creditsRemaining(deps(() => whoami(1234)))).toBe(1234);
    expect(await creditsRemaining({ fetch: (async () => { throw new Error("nere"); }) as typeof fetch, apiKey: "x", projectId: "p" })).toBeNull();
  });
});
