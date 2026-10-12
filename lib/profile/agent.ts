import { generateText, isStepCount, NoObjectGeneratedError, Output, tool } from "ai";
import { z } from "zod";
import { isInterstitial, toText } from "@/lib/enrich/extract";
import type { LanguageModel } from "ai";
import { isAiConfigured, profileModel, profileModelId, providerOptionsFor } from "@/lib/ai/model";
import { detectTech } from "./detectors";
import { FactBook } from "./facts";
import type { InventoryLink } from "./links";
import { buildProfilePrompt, PROFILE_INSTRUCTIONS } from "./prompt";
import { PageBudget, safeFetch as realSafeFetch } from "./safe-fetch";
import { coerceModelOutput, repairModelJson } from "./repair";
import { ProfileModelOutput, type PageLog, type PageText, type ServiceItem } from "./types";

// AI-steget. Modellen får fakta och sidtext som koden samlat, och ett enda verktyg: hämta en sida ur sajtens egna
// länkar. Den svarar med ett strukturerat objekt som assemble.ts sedan granskar, så ingenting den skriver når
// profilen utan kontroll.

const MAX_STEPS = 6;
const INPUT_TOKEN_CAP = 60_000;
const MAX_OUTPUT_TOKENS = 4000;
const TIMEOUT_MS = 120_000;
const TOOL_TEXT_LIMIT = 6000;

export interface AgentContext {
  book: FactBook;
  texts: PageText[];
  pages: PageLog[];
  inventory: InventoryLink[];
  boundary: string;
  budget: PageBudget;
  safeFetch?: typeof realSafeFetch;
}

const norm = (u: string) => u.replace(/#.*$/, "").replace(/\/$/, "").toLowerCase();

export type FetchForModelResult =
  | { ok: true; id: string; url: string; text: string; nyaFakta: { id: string; label: string }[] }
  | { ok: false; message: string };

/** Verktygets logik. Avvisar allt som inte är en länk ur inventariet, och räknar mot sidbudgeten. */
export async function fetchPageForModel(ctx: AgentContext, input: { url: string; skal?: string }): Promise<FetchForModelResult> {
  const wanted = norm(input.url);
  const entry = ctx.inventory.find((l) => norm(l.url) === wanted);
  if (!entry) return { ok: false, message: "Sidan finns inte bland de sidor du får hämta." };
  if (ctx.texts.some((t) => norm(t.url) === wanted)) return { ok: false, message: "Du har redan den sidan." };

  const fetchPage = ctx.safeFetch ?? realSafeFetch;
  const page = await fetchPage(entry.url, ctx.boundary, ctx.budget, "model");
  ctx.pages.push({ url: page.url, status: page.status, bytes: page.html?.length ?? 0, via: "model", problem: page.problem });
  if (!page.html) return { ok: false, message: page.problem ?? "Sidan gick inte att hämta." };
  if (isInterstitial(page.html)) return { ok: false, message: "Sidan svarade med en robotkontroll." };

  const fact = ctx.book.add({ kind: "page", label: "Sidan hämtades", value: page.finalUrl, source: page.finalUrl, detector: `page:${ctx.texts.length}` });
  const before = new Set(ctx.book.all().map((f) => f.id));
  const known = new Set(ctx.book.all().map((f) => f.detector));
  const fresh = detectTech({ html: page.html }).filter((t) => !known.has(t.id));
  const newFacts = ctx.book.addDetections(fresh, page.finalUrl).filter((f) => !before.has(f.id));
  const text = toText(page.html).slice(0, TOOL_TEXT_LIMIT);
  ctx.texts.push({ id: fact.id, url: page.finalUrl, text });
  return { ok: true, id: fact.id, url: page.finalUrl, text, nyaFakta: newFacts.map((f) => ({ id: f.id, label: f.label })) };
}

export interface AgentResult {
  output: ProfileModelOutput;
  inputTokens: number;
  outputTokens: number;
  steps: number;
  model: string;
}

export interface AgentInput {
  company: { name: string | null; orgnr: string | null; domain: string | null };
  ctx: AgentContext;
  knownServices?: ServiceItem[];
  signal?: AbortSignal;
  /** För test: ersätter själva modellanropet. */
  generate?: typeof generateText;
  /** Byråers profiler skrivs av Claude i stället för standardmodellen. */
  modelChoice?: { id: string; model: LanguageModel };
}

/** Ett försök kan ge nästan rätt JSON. Går den att laga och klarar schemat används den, annars kastas felet vidare. */
export function recoverOutput(error: unknown): ProfileModelOutput | null {
  if (!NoObjectGeneratedError.isInstance(error) || !error.text) return null;
  const fixed = repairModelJson(error.text);
  if (!fixed) return null;
  const coerced = coerceModelOutput(JSON.parse(fixed));
  if (!coerced) return null;
  const parsed = ProfileModelOutput.safeParse(coerced);
  return parsed.success ? parsed.data : null;
}

export async function runAgent({ company, ctx, knownServices, signal, generate = generateText, modelChoice }: AgentInput): Promise<AgentResult> {
  if (!modelChoice && !isAiConfigured()) throw new Error("AI är inte konfigurerat.");
  const modelId = modelChoice?.id ?? profileModelId();
  let inputTokens = 0;
  let outputTokens = 0;
  let steps = 0;

  const attempt = () =>
    generate({
      model: modelChoice?.model ?? profileModel(),
      instructions: PROFILE_INSTRUCTIONS,
      prompt: buildProfilePrompt({ company, facts: ctx.book.all(), texts: ctx.texts, inventory: ctx.inventory, pagesLeft: ctx.budget.modelTotal - ctx.budget.byModel, knownServices }),
      tools: {
        hamtaSida: tool({
          description: "Hämtar en sida från företagets egen webbplats. Bara sidor ur listan 'Sidor du kan hämta'.",
          inputSchema: z.object({ url: z.string().max(500).describe("Adressen, exakt som den står i listan"), skal: z.string().max(200).describe("Varför sidan behövs") }),
          execute: async (input) => fetchPageForModel(ctx, input),
        }),
      },
      output: Output.object({ schema: ProfileModelOutput }),
      stopWhen: isStepCount(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Över taket, eller när sidbudgeten är slut, stängs verktyget så att nästa steg måste ge svaret.
      prepareStep: async ({ steps: done }) => {
        const used = done.reduce((n, s) => n + (s.usage?.inputTokens ?? 0), 0);
        return used > INPUT_TOKEN_CAP || ctx.budget.byModel >= ctx.budget.modelTotal ? { activeTools: [] } : {};
      },
      providerOptions: providerOptionsFor(modelId) as never,
      abortSignal: signal,
      timeout: TIMEOUT_MS,
    });

  // Två försök. Ett trasigt svar lagas först, och först om det inte går tas ett nytt.
  for (let n = 1; ; n++) {
    try {
      const result = await attempt();
      inputTokens += result.totalUsage.inputTokens ?? 0;
      outputTokens += result.totalUsage.outputTokens ?? 0;
      steps += result.steps.length;
      return { output: result.output, inputTokens, outputTokens, steps, model: modelId };
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) {
        inputTokens += e.usage?.inputTokens ?? 0;
        outputTokens += e.usage?.outputTokens ?? 0;
        const repaired = recoverOutput(e);
        if (repaired) return { output: repaired, inputTokens, outputTokens, steps: steps + 1, model: modelId };
        if (n < 2 && !signal?.aborted) continue;
      }
      throw e;
    }
  }
}
