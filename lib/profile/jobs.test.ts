import { describe, expect, it, vi } from "vitest";
import { FactBook } from "./facts";
import { findJobs, jobFacts, mapJobs } from "./jobs";

const hit = (over: Record<string, unknown> = {}) => ({
  id: "1", headline: "Rörmokare", webpage_url: "https://arbetsformedlingen.se/platsbanken/annonser/1", publication_date: "2026-09-23T11:22:05", application_deadline: "2026-10-23T23:59:59",
  employer: { organization_number: "5562844240" }, occupation: { label: "Rörmokare" }, workplace_address: { municipality: "Malmö" }, ...over,
});

describe("mapJobs", () => {
  it("maps the ads and keeps only the ones that belong to the employer", () => {
    const r = mapJobs({ total: { value: 14 }, hits: [hit(), hit({ id: "2", employer: { organization_number: "5560000000" } }), hit({ id: "3", headline: undefined })] }, "5562844240");
    expect(r.total).toBe(14);
    expect(r.ads).toEqual([{ id: "1", title: "Rörmokare", occupation: "Rörmokare", city: "Malmö", published: "2026-09-23", deadline: "2026-10-23", url: "https://arbetsformedlingen.se/platsbanken/annonser/1" }]);
  });
  it("never reports fewer ads than it lists, and copes with an odd response", () => {
    expect(mapJobs({ total: { value: 0 }, hits: [hit()] }, "5562844240").total).toBe(1);
    expect(mapJobs(null, "5562844240")).toEqual({ total: 0, ads: [] });
  });
});

describe("findJobs", () => {
  const ok = (body: unknown) => ({ fetch: vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, json: async () => body }) as Response) });
  it("asks with the number as digits only", async () => {
    const d = ok({ total: { value: 1 }, hits: [hit()] });
    expect(await findJobs("556284-4240", d)).toMatchObject({ total: 1 });
    expect(String(d.fetch.mock.calls[0][0])).toContain("employer=5562844240");
  });
  it("gives null without a valid number, with no ads, and when the service fails", async () => {
    expect(await findJobs(null, ok({}))).toBeNull();
    expect(await findJobs("123", ok({}))).toBeNull();
    expect(await findJobs("556284-4240", ok({ total: { value: 0 }, hits: [] }))).toBeNull();
    expect(await findJobs("556284-4240", { fetch: vi.fn(async () => ({ ok: false }) as Response) })).toBeNull();
    expect(await findJobs("556284-4240", { fetch: vi.fn(async () => { throw new Error("nere"); }) })).toBeNull();
  });
});

describe("jobFacts", () => {
  it("writes the count and the first ads as facts", () => {
    const b = new FactBook();
    jobFacts(b, mapJobs({ total: { value: 3 }, hits: [hit()] }, "5562844240"));
    jobFacts(b, null);
    expect(b.all().map((f) => [f.label, f.value])).toEqual([["Öppna platsannonser", "3 annonser hos Arbetsförmedlingen"], ["Platsannons", "Rörmokare, Malmö, publicerad 2026-09-23"]]);
  });
});
