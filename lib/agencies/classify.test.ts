import { describe, expect, it, vi } from "vitest";
import { classifyCredit, classifyWithClaude, type AiVerdict, type ClassifyDeps, type ClassifyInput } from "./classify";

const input = (over: Partial<ClassifyInput> = {}): ClassifyInput => ({ name: "Beegleton", domain: "beegleton.com", phrase: "made-by", snippet: "Skapad av Beegleton", ...over });

function deps(over: Partial<ClassifyDeps> = {}): ClassifyDeps {
  return { read: vi.fn(async () => null), save: vi.fn(async () => {}), ai: vi.fn(async (): Promise<AiVerdict | null> => null), aiConfigured: () => false, ...over };
}

describe("classifyCredit", () => {
  it("lets an admin's correction decide before anything else", async () => {
    const d = deps({ read: async () => ({ kind: "platform", source: "admin", reason: "Rättat" }) });
    expect(await classifyCredit(input(), d)).toMatchObject({ kind: "platform", source: "admin" });
  });
  it("uses an earlier AI judgement without asking again", async () => {
    const d = deps({ read: async () => ({ kind: "agency", source: "ai", reason: "Byrå" }), aiConfigured: () => true });
    expect(await classifyCredit(input({ phrase: "powered-by" }), d)).toMatchObject({ kind: "agency", source: "saved" });
    expect(d.ai).not.toHaveBeenCalled();
  });
  it("knows a platform by rule, even behind a 'skapad av' phrase", async () => {
    expect(await classifyCredit(input({ name: "Snowfire", domain: "snowfire.se", phrase: "powered-by" }), deps())).toMatchObject({ kind: "platform", source: "rule" });
    expect(await classifyCredit(input({ domain: "app.wix.com" }), deps())).toMatchObject({ kind: "platform", source: "rule" });
  });
  it("treats a 'skapad av' credit to an unknown external domain as an agency, by rule", async () => {
    expect(await classifyCredit(input(), deps())).toMatchObject({ kind: "agency", source: "rule" });
  });
  it("leaves a 'powered by' credit unknown when there is no AI", async () => {
    expect(await classifyCredit(input({ phrase: "powered-by" }), deps())).toMatchObject({ kind: null, source: null });
  });
  it("asks the AI for an ambiguous credit, and remembers a confident answer", async () => {
    const d = deps({ aiConfigured: () => true, ai: vi.fn(async (): Promise<AiVerdict> => ({ kind: "agency", confidence: "high", reason: "Webbyrå" })) });
    expect(await classifyCredit(input({ phrase: "powered-by" }), d)).toMatchObject({ kind: "agency", source: "ai" });
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ domain: "beegleton.com", kind: "agency", source: "ai" }));
  });
  it("keeps unsure or failed AI answers as unknown and does not save them", async () => {
    const unsure = deps({ aiConfigured: () => true, ai: async () => ({ kind: "agency", confidence: "low", reason: "Kanske" }) });
    expect(await classifyCredit(input({ phrase: "powered-by" }), unsure)).toMatchObject({ kind: null });
    expect(unsure.save).not.toHaveBeenCalled();
    expect(await classifyCredit(input({ phrase: "powered-by" }), deps({ aiConfigured: () => true, ai: async () => null }))).toMatchObject({ kind: null });
  });
  it("still answers when the memory cannot be read or written", async () => {
    const d = deps({ read: async () => { throw new Error("db"); }, save: async () => { throw new Error("db"); }, aiConfigured: () => true, ai: async () => ({ kind: "tool", confidence: "medium", reason: "Verktyg" }) });
    expect(await classifyCredit(input({ phrase: "powered-by" }), d)).toMatchObject({ kind: "tool", source: "ai" });
  });
});

describe("classifyWithClaude", () => {
  it("gives the verdict, and the model never gets more than the snippet limit", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const generate = vi.fn(async () => ({ output: { kind: "platform", confidence: "high", reason: "Sajtbyggare" }, totalUsage: { inputTokens: 300, outputTokens: 30 } })) as never;
    const r = await classifyWithClaude(input({ snippet: "x".repeat(5000) }), generate);
    expect(r).toEqual({ kind: "platform", confidence: "high", reason: "Sajtbyggare" });
    const prompt = String((generate as unknown as { mock: { calls: [{ prompt: string }][] } }).mock.calls[0][0].prompt);
    expect(prompt.length).toBeLessThan(2000);
    vi.unstubAllEnvs();
  });
  it("returns null instead of throwing when the call fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await classifyWithClaude(input(), (async () => { throw new Error("nere"); }) as never)).toBeNull();
    quiet.mockRestore();
  });
});

describe("classifyCredit with the creator's own homepage", () => {
  it("gives the model what the credited site says about itself, and only when the rules do not decide", async () => {
    const seen: ClassifyInput[] = [];
    const d = { ...deps({ aiConfigured: () => true }), describe: async () => "Titel: Digitala rabatthäften för föreningar", ai: async (i: ClassifyInput) => { seen.push(i); return { kind: "tool" as const, confidence: "high" as const, reason: "Säljer rabatthäften." }; } };
    expect(await classifyCredit(input({ name: "Föreningshäftet", domain: "foreningshaftet.com", phrase: "powered-by" }), d)).toMatchObject({ kind: "tool", source: "ai" });
    expect(seen[0].about).toContain("rabatthäften");
    seen.length = 0;
    await classifyCredit(input({ phrase: "made-by" }), d);
    expect(seen).toEqual([]);
  });
  it("still classifies when the homepage cannot be read", async () => {
    const d = { ...deps({ aiConfigured: () => true }), describe: async () => { throw new Error("nere"); }, ai: async () => ({ kind: "agency" as const, confidence: "high" as const, reason: "x" }) };
    expect(await classifyCredit(input({ phrase: "powered-by" }), d)).toMatchObject({ kind: "agency" });
  });
});

