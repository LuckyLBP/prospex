import { describe, expect, it, vi } from "vitest";
import type { generateText } from "ai";
import { findCreditWithClaude, nameOfLink, type FooterAiDeps } from "./footer-ai";

const HTML = `<html><body><footer><p>© 2026 SA Bygg</p>
<a href="https://www.facebook.com/sabygg">Facebook</a>
<a href="https://partner-bygg.se">Partner Bygg</a>
<span>Hemsidan skapades med stolthet av <a href="https://arly.se/">ARLY</a></span>
<a href="/integritet">Integritet</a></footer></body></html>`;

function deps(output: unknown, configured = true): FooterAiDeps & { generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(async () => ({ output, totalUsage: { inputTokens: 400, outputTokens: 40 } })) as unknown as typeof generateText & ReturnType<typeof vi.fn>;
  return { generate, configured: () => configured } as never;
}
const verdict = (over: Record<string, unknown> = {}) => ({ choice: 2, role: "agency", confidence: "high", reason: "Raden säger att sajten skapats av dem.", ...over });

describe("findCreditWithClaude", () => {
  it("picks the footer link Claude points to, and names it from the link text", async () => {
    const d = deps(verdict());
    const r = await findCreditWithClaude(HTML, "sabygg.nu", d);
    expect(r).toMatchObject({ name: "ARLY", domain: "arly.se", url: "https://arly.se", role: "agency" });
    // Listan Claude får är bara sidfotens externa länkar, utan sociala medier och sajtens egna.
    const prompt = String((d.generate.mock.calls[0][0] as { prompt: string }).prompt);
    expect(prompt).toContain("1. partner-bygg.se");
    expect(prompt).toContain("2. arly.se (länktext: ARLY)");
    expect(prompt).not.toContain("facebook");
  });
  it("can only choose a link that exists: a number outside the list is rejected", async () => {
    expect(await findCreditWithClaude(HTML, "sabygg.nu", deps(verdict({ choice: 7 })))).toBeNull();
    expect(await findCreditWithClaude(HTML, "sabygg.nu", deps(verdict({ choice: 0 })))).toBeNull();
  });
  it("gives nothing for 'none', for low confidence, or for no choice", async () => {
    expect(await findCreditWithClaude(HTML, "sabygg.nu", deps(verdict({ role: "none", choice: null })))).toBeNull();
    expect(await findCreditWithClaude(HTML, "sabygg.nu", deps(verdict({ confidence: "low" })))).toBeNull();
    expect(await findCreditWithClaude(HTML, "sabygg.nu", deps(verdict({ choice: null })))).toBeNull();
  });
  it("reports a platform as a platform", async () => {
    expect(await findCreditWithClaude(HTML, "sabygg.nu", deps(verdict({ role: "platform", choice: 1 })))).toMatchObject({ role: "platform", domain: "partner-bygg.se" });
  });
  it("skips the call without a key or without any external link, and never throws", async () => {
    const off = deps(verdict(), false);
    expect(await findCreditWithClaude(HTML, "sabygg.nu", off)).toBeNull();
    expect(off.generate).not.toHaveBeenCalled();
    const bare = deps(verdict());
    expect(await findCreditWithClaude(`<html><body><footer>© Företaget <a href="/om">Om oss</a></footer></body></html>`, "foretag.se", bare)).toBeNull();
    expect(bare.generate).not.toHaveBeenCalled();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { generate: vi.fn(async () => { throw new Error("nere"); }) as never, configured: () => true } as FooterAiDeps;
    expect(await findCreditWithClaude(HTML, "sabygg.nu", failing)).toBeNull();
    quiet.mockRestore();
  });
});

describe("nameOfLink", () => {
  it("uses the link text when it looks like a name, else the domain without its ending", () => {
    expect(nameOfLink({ url: "https://arly.se", domain: "arly.se", text: "ARLY" })).toBe("ARLY");
    expect(nameOfLink({ url: "https://arly.se", domain: "arly.se", text: "https://arly.se" })).toBe("arly");
    expect(nameOfLink({ url: "https://arly.se", domain: "arly.se", text: "" })).toBe("arly");
    expect(nameOfLink({ url: "https://www.snowfire.se", domain: "snowfire.se", text: "Powered by Snowfire" })).toBe("Snowfire");
  });
});
