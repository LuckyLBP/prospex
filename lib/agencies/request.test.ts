import { describe, expect, it, vi } from "vitest";
import { DAILY_CLAUDE_SEK_CAP } from "./spend";
import { MAX_ACTIVE_AGENCY_RUNS, MAX_NEW_AGENCIES_PER_DAY } from "./auto";
import { displayName, getListState, REQUESTS_PER_USER_PER_DAY, requestCustomerList, RETRY_AFTER_MS, stateOf, type RequestDeps, type RequestInput } from "./request";
import type { SourceState } from "./store";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const input = (over: Partial<RequestInput> = {}): RequestInput => ({ domain: "leads.nu", name: "Leads Sverige AB | Ledande inom SEO", orgId: "org1", userId: "u1", profileId: "p1", ...over });
const source = (over: Partial<SourceState> = {}): SourceState => ({ id: "s1", slug: "leads", name: "Leads", kind: "supplier", published: false, method: "agency", customers: 0, lastRun: null, ...over });
const run = (status: string, agoMs = 0) => ({ status, error: null, note: null, at: new Date(NOW - agoMs) });

function deps(over: Partial<RequestDeps> = {}): RequestDeps {
  return {
    enabled: () => true,
    find: vi.fn(async () => null),
    usage: vi.fn(async () => ({ newToday: 0, activeRuns: 0 })),
    spend: vi.fn(async () => ({ credits: 0, costSek: 0 })),
    userRequestsToday: vi.fn(async () => 0),
    create: vi.fn(async () => "new-id"),
    start: vi.fn(async () => {}),
    record: vi.fn(async () => {}),
    now: () => NOW,
    ...over,
  };
}

describe("stateOf", () => {
  it("maps what we know about a domain to what the customer sees", () => {
    expect(stateOf(null)).toEqual({ state: "none" });
    expect(stateOf(source({ published: true, customers: 40 }))).toEqual({ state: "have", slug: "leads", name: "Leads", customers: 40 });
    expect(stateOf(source({ lastRun: run("running") }))).toEqual({ state: "searching" });
    expect(stateOf(source({ lastRun: run("queued") }))).toEqual({ state: "searching" });
    expect(stateOf(source({ customers: 2, lastRun: run("success") }))).toEqual({ state: "too-few", customers: 2 });
    expect(stateOf(source({ lastRun: run("error") }))).toEqual({ state: "failed" });
    expect(stateOf(source())).toEqual({ state: "none" });
  });
});

describe("displayName", () => {
  it("shortens a page title to the company name", () => {
    expect(displayName("Leads Sverige AB | Ledande inom SEO, SEM och AI-Sök", "leads.nu")).toBe("Leads Sverige AB");
    expect(displayName("Leads Sverige AB I Ledande inom SEO, SEM och AI-Sök", "leads.nu")).toBe("Leads Sverige AB");
    expect(displayName("Offerta Group AB", "offerta.se")).toBe("Offerta Group AB");
  });
  it("falls back to the domain", () => {
    expect(displayName(null, "offerta.se")).toBe("Offerta");
    expect(displayName("", "leads.nu")).toBe("Leads");
  });
});

describe("getListState", () => {
  it("normalizes the domain and reads without starting anything", async () => {
    const find = vi.fn(async () => source({ published: true, customers: 9 }));
    expect(await getListState("https://www.Leads.nu/", find)).toMatchObject({ state: "have" });
    expect(find).toHaveBeenCalledWith("leads.nu");
    expect(await getListState(null, find)).toEqual({ state: "none" });
  });
});

describe("requestCustomerList", () => {
  it("starts a search for an unknown domain with a clean name, and records who asked", async () => {
    const d = deps();
    expect(await requestCustomerList(input(), d)).toEqual({ state: "searching" });
    expect(d.create).toHaveBeenCalledWith({ name: "Leads Sverige AB", domain: "leads.nu" });
    expect(d.start).toHaveBeenCalledWith("new-id");
    expect(d.record).toHaveBeenCalledWith({ domain: "leads.nu", supplierId: "new-id", orgId: "org1", userId: "u1", profileId: "p1" });
  });
  it("does nothing when switched off, and for a domain that is not one", async () => {
    const d = deps({ enabled: () => false });
    expect(await requestCustomerList(input(), d)).toEqual({ state: "disabled" });
    expect(d.start).not.toHaveBeenCalled();
    expect(await requestCustomerList(input({ domain: "inte en domän" }), deps())).toEqual({ state: "none" });
  });
  it("links the org to a published list without starting a run", async () => {
    const d = deps({ find: vi.fn(async () => source({ published: true, customers: 30 })) });
    expect(await requestCustomerList(input(), d)).toMatchObject({ state: "have", slug: "leads" });
    expect(d.start).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ supplierId: "s1" }));
  });
  it("shares a search that is already running instead of starting a second one", async () => {
    const d = deps({ find: vi.fn(async () => source({ lastRun: run("running") })) });
    expect(await requestCustomerList(input({ orgId: "org2" }), d)).toEqual({ state: "searching" });
    expect(d.start).not.toHaveBeenCalled();
    expect(d.create).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org2", supplierId: "s1" }));
  });
  it("leaves a source an admin built another way alone", async () => {
    const d = deps({ find: vi.fn(async () => source({ method: "publicwww" })) });
    expect(await requestCustomerList(input(), d)).toEqual({ state: "later" });
    expect(d.start).not.toHaveBeenCalled();
  });
  it("does not rerun a fresh failure or thin result, but does after a day", async () => {
    const fresh = deps({ find: vi.fn(async () => source({ customers: 2, lastRun: run("success", 1000) })) });
    expect(await requestCustomerList(input(), fresh)).toEqual({ state: "too-few", customers: 2 });
    expect(fresh.start).not.toHaveBeenCalled();

    const old = deps({ find: vi.fn(async () => source({ lastRun: run("error", RETRY_AFTER_MS + 1000) })) });
    expect(await requestCustomerList(input(), old)).toEqual({ state: "searching" });
    expect(old.start).toHaveBeenCalledWith("s1");
    expect(old.create).not.toHaveBeenCalled();
  });
  it("holds back when a limit is reached, and records nothing", async () => {
    for (const d of [
      deps({ userRequestsToday: vi.fn(async () => REQUESTS_PER_USER_PER_DAY) }),
      deps({ usage: vi.fn(async () => ({ newToday: MAX_NEW_AGENCIES_PER_DAY, activeRuns: 0 })) }),
      deps({ usage: vi.fn(async () => ({ newToday: 0, activeRuns: MAX_ACTIVE_AGENCY_RUNS })) }),
      deps({ spend: vi.fn(async () => ({ credits: 0, costSek: DAILY_CLAUDE_SEK_CAP })) }),
    ]) {
      expect(await requestCustomerList(input(), d)).toEqual({ state: "later" });
      expect(d.start).not.toHaveBeenCalled();
      expect(d.record).not.toHaveBeenCalled();
    }
  });
  it("lets a rerun of an existing source through even when the new-source cap is full", async () => {
    const d = deps({
      find: vi.fn(async () => source({ lastRun: run("error", RETRY_AFTER_MS + 1000) })),
      usage: vi.fn(async () => ({ newToday: MAX_NEW_AGENCIES_PER_DAY, activeRuns: 0 })),
    });
    expect(await requestCustomerList(input(), d)).toEqual({ state: "searching" });
  });
});
