import { describe, expect, it, vi } from "vitest";
import type { ProfileCreator } from "@/lib/profile/types";
import { DAILY_CLAUDE_SEK_CAP, DAILY_CREDIT_CAP } from "./spend";
import { MAX_ACTIVE_AGENCY_RUNS, MAX_NEW_AGENCIES_PER_DAY, maybeStartAgency, type AutoDeps, type AutoInput } from "./auto";

const creator: ProfileCreator = { name: "Conseo Webb", url: "https://conseo.se", domain: "conseo.se", logoPath: "logos/conseo.png", supplierSlug: null, phrase: "made-by", kind: "agency", kindSource: "rule" };
const input = (over: Partial<AutoInput> = {}): AutoInput => ({ creator, customerDomain: "kund.se", isAgencyProfile: false, ...over });

function deps(over: Partial<AutoDeps> = {}): AutoDeps {
  return {
    enabled: () => true,
    resolveDomain: vi.fn(async (c: ProfileCreator) => c.domain),
    known: vi.fn(async () => false),
    usage: vi.fn(async () => ({ newToday: 0, activeRuns: 0 })),
    spend: vi.fn(async () => ({ credits: 0, costSek: 0 })),
    start: vi.fn(async () => true),
    ...over,
  };
}

describe("maybeStartAgency", () => {
  it("starts an agency it has never seen, with its name, domain and logo", async () => {
    const d = deps();
    expect(await maybeStartAgency(input(), d)).toEqual({ started: true, domain: "conseo.se" });
    expect(d.start).toHaveBeenCalledWith({ name: "Conseo Webb", domain: "conseo.se", logoPath: "logos/conseo.png" });
  });
  it("passes on that the agency was found through its server, so an admin can see it", async () => {
    const d = deps();
    await maybeStartAgency(input({ foundVia: { ip: "81.2.3.4", sites: 130 } }), d);
    expect(d.start).toHaveBeenCalledWith({ name: "Conseo Webb", domain: "conseo.se", logoPath: "logos/conseo.png", foundVia: { ip: "81.2.3.4", sites: 130 } });
  });
  it("does nothing when off, without an agency, or when the profile is itself an agency's", async () => {
    expect(await maybeStartAgency(input(), deps({ enabled: () => false }))).toEqual({ started: false, reason: "disabled" });
    expect(await maybeStartAgency(input({ creator: null }), deps())).toEqual({ started: false, reason: "no-agency" });
    expect(await maybeStartAgency(input({ isAgencyProfile: true }), deps())).toEqual({ started: false, reason: "agency-profile" });
  });
  it("never starts anything for a credit that is not judged to be an agency", async () => {
    const d = deps();
    for (const kind of [null, undefined, "platform", "not-agency"] as const) {
      expect(await maybeStartAgency(input({ creator: { ...creator, kind } }), d)).toEqual({ started: false, reason: "not-agency" });
    }
    expect(d.start).not.toHaveBeenCalled();
  });
  it("skips an agency we already have a profile or source for, and a site that is its own agency", async () => {
    const d = deps({ known: vi.fn(async () => true) });
    expect(await maybeStartAgency(input(), d)).toEqual({ started: false, reason: "known" });
    expect(d.start).not.toHaveBeenCalled();
    expect(await maybeStartAgency(input({ customerDomain: "www.conseo.se" }), deps())).toEqual({ started: false, reason: "own-site" });
  });
  it("skips when no domain can be found for the agency", async () => {
    expect(await maybeStartAgency(input({ creator: { ...creator, domain: null } }), deps({ resolveDomain: async () => null }))).toEqual({ started: false, reason: "no-domain" });
  });
  it("respects the daily cap and the limit on simultaneous runs", async () => {
    expect(await maybeStartAgency(input(), deps({ usage: async () => ({ newToday: MAX_NEW_AGENCIES_PER_DAY, activeRuns: 0 }) }))).toEqual({ started: false, reason: "daily-cap" });
    expect(await maybeStartAgency(input(), deps({ usage: async () => ({ newToday: 0, activeRuns: MAX_ACTIVE_AGENCY_RUNS }) }))).toEqual({ started: false, reason: "busy" });
  });
  it("declines when the day's OpenSEO credits or Claude kronor are used up", async () => {
    expect(await maybeStartAgency(input(), deps({ spend: async () => ({ credits: DAILY_CREDIT_CAP, costSek: 0 }) }))).toEqual({ started: false, reason: "daily-cap" });
    expect(await maybeStartAgency(input(), deps({ spend: async () => ({ credits: 0, costSek: DAILY_CLAUDE_SEK_CAP }) }))).toEqual({ started: false, reason: "daily-cap" });
    expect(await maybeStartAgency(input(), deps({ spend: async () => ({ credits: DAILY_CREDIT_CAP - 1, costSek: DAILY_CLAUDE_SEK_CAP - 1 }) }))).toEqual({ started: true, domain: "conseo.se" });
  });
  it("treats losing a race to create the source as 'known', and never throws", async () => {
    expect(await maybeStartAgency(input(), deps({ start: async () => false }))).toEqual({ started: false, reason: "known" });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await maybeStartAgency(input(), deps({ known: async () => { throw new Error("db nere"); } }))).toEqual({ started: false, reason: "error" });
    quiet.mockRestore();
  });
});
