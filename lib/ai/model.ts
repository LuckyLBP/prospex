import { createAnthropic } from "@ai-sdk/anthropic";
import { deepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";

// Det enda stället som vet vilken AI-leverantör som används. Byt modell med PROFILE_MODEL, till exempel
// "anthropic/claude-haiku-4.5" via Vercel AI Gateway.
//
// Standard: DeepSeek V4 Flash. Billigast och snabbast, och uppgiften är att sammanfatta fakta den fått,
// inte att resonera. Har vi DEEPSEEK_API_KEY går anropet direkt till DeepSeek, annars genom gatewayen
// (AI_GATEWAY_API_KEY lokalt, OIDC på Vercel).

export const DEFAULT_PROFILE_MODEL = "deepseek/deepseek-v4-flash";

export function isAiConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

export function profileModelId(): string {
  return process.env.PROFILE_MODEL || DEFAULT_PROFILE_MODEL;
}

export function profileModel(): LanguageModel {
  const id = profileModelId();
  if (process.env.DEEPSEEK_API_KEY && id.startsWith("deepseek/")) return deepSeek(id.slice("deepseek/".length));
  return id;
}

/** Tänkandet stängs av för DeepSeek: det mångdubblar väntan för en uppgift som är att sammanfatta. */
export function providerOptionsFor(id: string): Record<string, Record<string, unknown>> | undefined {
  return id.startsWith("deepseek/") ? { deepseek: { thinking: { type: "disabled" } } } : undefined;
}

// Byråer: Claude via Anthropic direkt (ANTHROPIC_API_KEY), eftersom Claudes inbyggda webbsökning och sidhämtning
// bara finns där. Sonnet är standard: uppgiften är att leta och läsa, och Opus kostar dubbelt.
export const DEFAULT_AGENCY_MODEL = "claude-sonnet-5-5";

export const isAnthropicConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);
export const agencyModelId = (): string => process.env.AGENCY_MODEL || DEFAULT_AGENCY_MODEL;
/** Bedömningen av en kredit i en sidfot: ett kort svar på en liten text, så billigaste modellen räcker. */
export const DEFAULT_CLASSIFY_MODEL = "claude-haiku-5-5";
export const classifyModelId = (): string => process.env.CLASSIFY_MODEL || DEFAULT_CLASSIFY_MODEL;
export const classifyModel = (): LanguageModel => anthropicProvider()(classifyModelId());

/**
 * En nyckel som börjar på sk-ant-usr- hör till en användare och inte till en arbetsyta, och då måste varje anrop
 * ange vilken arbetsyta det gäller (ANTHROPIC_WORKSPACE_ID). En nyckel som skapats i en arbetsyta behöver det inte.
 */
function anthropicProvider() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return createAnthropic(workspace ? { headers: { "anthropic-workspace-id": workspace } } : {});
}

/**
 * Org.nr-uppslag på företagsnamn kräver webbsökning som hittar rätt bolagssida. Haiku missade tre av fyra bolag som
 * Sonnet hittade (kontrollerat 2026-10-12), så uppslaget använder Sonnet.
 */
export const DEFAULT_LOOKUP_MODEL = "claude-sonnet-5-5";
export const lookupModelId = (): string => process.env.ORGNR_MODEL || DEFAULT_LOOKUP_MODEL;
export const lookupModel = (): LanguageModel => anthropicProvider()(lookupModelId());

/** Kontaktpersoner ur en sidas text: strukturera text som redan är utvald, så den billigaste modellen räcker. */
export const DEFAULT_PEOPLE_MODEL = "claude-haiku-5-5";
export const peopleModelId = (): string => process.env.PEOPLE_MODEL || DEFAULT_PEOPLE_MODEL;
export const peopleModel = (): LanguageModel => anthropicProvider()(peopleModelId());

export const agencyModel = (): LanguageModel => anthropicProvider()(agencyModelId());

/**
 * Grov kostnad i kronor, bara för att visa storleksordningen. DeepSeek är en uppskattning i SEK per miljon tokens.
 * Claude är leverantörens lista i USD per miljon tokens (platform.claude.com/docs/en/about-claude/pricing,
 * kontrollerad 2026-10-12), omräknad med USD_SEK. Priserna ska ses över när listan ändras.
 */
const PRICE_SEK_PER_MILLION: Record<string, { input: number; output: number }> = {
  "deepseek/deepseek-v4-flash": { input: 1.5, output: 3 },
};
const PRICE_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  // Haiku 5.5 kostar mer för prompter över 100 000 tokens, vilket aldrig gäller här.
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
/** Webbsökningen kostar 10 USD per 1 000 sökningar. Sidhämtningen kostar inget utöver tokens. */
export const WEB_SEARCH_USD = 0.01;
const usdToSek = (): number => {
  const n = Number(process.env.USD_SEK);
  return Number.isFinite(n) && n > 0 ? n : 10.5;
};

export function estimateCostSek(modelId: string, inputTokens: number, outputTokens: number, webSearches = 0): number | null {
  const sek = PRICE_SEK_PER_MILLION[modelId];
  if (sek) return (inputTokens * sek.input + outputTokens * sek.output) / 1_000_000;
  const usd = PRICE_USD_PER_MILLION[modelId];
  return usd ? ((inputTokens * usd.input + outputTokens * usd.output) / 1_000_000 + webSearches * WEB_SEARCH_USD) * usdToSek() : null;
}
