import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { generateText } from "ai";
import { cleanCandidates, findCustomersWithClaude } from "./agent";

const agency = { name: "Conseo Webb", domain: "conseo.se" };
const raw = (domain: string, over: Record<string, unknown> = {}) => ({ domain, name: null, evidenceUrl: "https://conseo.se/kunder", evidenceQuote: "Våra kunder", kind: "portfolio" as const, ...over });

describe("cleanCandidates", () => {
  it("normalises domains and drops the agency's own, known ones and duplicates", () => {
    const r = cleanCandidates([raw("https://www.Kund1.se/"), raw("kund1.se"), raw("blogg.conseo.se"), raw("redan.se"), raw("inte en domän"), raw("kund2.se", { name: " Kund Två AB ", evidenceQuote: "" })], agency, ["redan.se"]);
    expect(r.map((c) => c.domain)).toEqual(["kund1.se", "kund2.se"]);
    expect(r[1]).toMatchObject({ name: "Kund Två AB", evidenceQuote: null });
  });
});

describe("findCustomersWithClaude", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  const fake = (output: unknown, toolNames: string[] = []) =>
    vi.fn(async () => ({ output, totalUsage: { inputTokens: 40_000, outputTokens: 1_000 }, steps: [{ toolCalls: toolNames.map((toolName) => ({ toolName })) }] })) as unknown as typeof generateText;

  it("returns cleaned candidates with usage, search count and an estimated cost", async () => {
    const generate = fake({ candidates: [raw("kund1.se"), raw("conseo.se")] }, ["web_search", "web_search", "web_fetch"]);
    const r = await findCustomersWithClaude({ agency, known: [], generate });
    expect(r.candidates.map((c) => c.domain)).toEqual(["kund1.se"]);
    expect(r).toMatchObject({ inputTokens: 40_000, outputTokens: 1_000, webSearches: 2, steps: 1, model: "claude-sonnet-5-5" });
    // (40 000 x 2 + 1 000 x 10) / 1 000 000 + 2 x 0,01 = 0,11 USD, i kronor med standardkursen.
    expect(r.costSek).toBeCloseTo(0.11 * 10.5, 5);
  });
  it("gives the model the agency, the known domains and both web tools, and no PublicWWW tool", async () => {
    const generate = fake({ candidates: [] });
    await findCustomersWithClaude({ agency, known: ["redan.se"], generate });
    const call = (generate as unknown as { mock: { calls: [Record<string, unknown>][] } }).mock.calls[0][0];
    expect(String(call.prompt)).toContain("conseo.se");
    expect(String(call.prompt)).toContain("redan.se");
    expect(Object.keys(call.tools as object).sort()).toEqual(["web_fetch", "web_search"]);
  });
  it("refuses to run without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(findCustomersWithClaude({ agency, known: [], generate: fake({ candidates: [] }) })).rejects.toThrow("ANTHROPIC_API_KEY");
  });
});
