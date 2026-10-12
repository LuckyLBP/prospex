import { CollectorError } from "@/lib/scrapers/types";
import type { BacklinkRow } from "./triage";

// Bakåtlänkar till byråns domän via OpenSEO (hostad, bygger på DataForSEO). Varje kunds sidfot har en kreditlänk
// till byrån, så listan över vem som länkar dit är i praktiken listan över kunderna, plus en hel del brus som
// triage.ts rensar. Servern svarar med vanlig JSON utan sessionssteg, så ett anrop är ett POST.
//
// Kostar krediter: cirka 30 per sida om 50 rader (kontrollerat 2026-10-12). Nyckeln agerar som användaren i
// arbetsytan (OPENSEO_API_KEY), och anropen räknas mot ett projekt (OPENSEO_PROJECT_ID).

const ENDPOINT = "https://app.openseo.so/mcp";
const TIMEOUT_MS = 40_000;
/** Under så här många krediter hoppas anropet över, så att en körning inte tömmer kontot. */
export const MIN_CREDITS = 300;
/** 200 rader kostar 34 krediter, 100 rader kostar 30 (mätt 2026-10-12), så den större sidan är betydligt billigare per rad. */
export const PAGE_SIZE = Number(process.env.OPENSEO_PAGE_SIZE) || 200;
/** Säkerhetstak på antal sidor. Det som bestämmer är krediterna nedan. */
export const MAX_PAGES = 20;
/** Krediter en byrå får kosta, om dygnets tak tillåter. Cirka 30 per sida. */
export const AGENCY_CREDIT_BUDGET = 450;
const CREDITS_PER_PAGE_GUESS = 30;

export interface OpenSeoDeps {
  fetch: typeof globalThis.fetch;
  apiKey: string | undefined;
  projectId: string | undefined;
  endpoint?: string;
}

export const defaultOpenSeoDeps = (): OpenSeoDeps => ({ fetch: globalThis.fetch, apiKey: process.env.OPENSEO_API_KEY, projectId: process.env.OPENSEO_PROJECT_ID });

export const isOpenSeoConfigured = (d: OpenSeoDeps = defaultOpenSeoDeps()): boolean => !!d.apiKey && !!d.projectId;

interface ToolResult {
  structuredContent?: unknown;
  content?: { type: string; text?: string }[];
  isError?: boolean;
  _meta?: { creditsRemaining?: number | null };
}

let rpcId = 0;

async function callTool(name: string, args: Record<string, unknown>, deps: OpenSeoDeps, signal?: AbortSignal): Promise<ToolResult> {
  if (!deps.apiKey) throw new CollectorError("OPENSEO_API_KEY saknas.");
  let response: Response;
  try {
    response = await deps.fetch(deps.endpoint ?? ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.apiKey}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new CollectorError(`Kunde inte nå OpenSEO: ${e instanceof Error ? e.message : "okänt fel"}`);
  }
  if (response.status === 401 || response.status === 403) throw new CollectorError("OpenSEO nekade nyckeln. Skapa en ny under Settings, API keys.");
  if (!response.ok) throw new CollectorError(`OpenSEO svarade ${response.status}.`);

  let body: { result?: ToolResult; error?: { message?: string } };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new CollectorError("OpenSEO svarade inte med JSON.");
  }
  if (body.error) throw new CollectorError(`OpenSEO: ${body.error.message ?? "okänt fel"}`);
  const result = body.result ?? {};
  if (result.isError) throw new CollectorError(`OpenSEO: ${result.content?.find((c) => c.text)?.text?.slice(0, 200) ?? "anropet misslyckades"}`);
  return result;
}

/** Krediter kvar. Kostar inget. Null när det inte går att läsa. */
export async function creditsRemaining(deps: OpenSeoDeps = defaultOpenSeoDeps()): Promise<number | null> {
  try {
    const r = await callTool("whoami", {}, deps);
    const n = (r.structuredContent as { creditsRemaining?: number | null } | undefined)?.creditsRemaining ?? r._meta?.creditsRemaining;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

/** Raderna i ett svar, oavsett om de ligger i structuredContent eller som JSON-text. Ren. */
export function rowsOf(result: ToolResult): { rows: BacklinkRow[]; total: number; hasMore: boolean } {
  let data: unknown = result.structuredContent;
  if (!data) {
    const text = result.content?.find((c) => c.text)?.text;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  }
  const b = (data as { backlinks?: { rows?: unknown[]; totalCount?: number; hasMore?: boolean } } | null)?.backlinks;
  const rows = (b?.rows ?? []).filter((r): r is BacklinkRow => !!r && typeof (r as BacklinkRow).domainFrom === "string" && typeof (r as BacklinkRow).urlFrom === "string");
  return { rows, total: typeof b?.totalCount === "number" ? b.totalCount : rows.length, hasMore: b?.hasMore === true };
}

export interface BacklinkResult {
  rows: BacklinkRow[];
  total: number;
  pages: number;
  creditsLeft: number | null;
  /** Krediter som den här hämtningen kostade. */
  creditsUsed: number;
  /** Det fanns fler länkande domäner än budgeten räckte till. */
  more: boolean;
}

/**
 * Bakåtlänkarna till en domän, en rad per länkande domän (den starkaste länken), sidvis. Hoppar över helt när
 * krediterna är under MIN_CREDITS. Kastar CollectorError med ett svenskt meddelande.
 */
export async function fetchBacklinks(domain: string, opts: { maxPages?: number; budget?: number; signal?: AbortSignal } = {}, deps: OpenSeoDeps = defaultOpenSeoDeps()): Promise<BacklinkResult> {
  if (!deps.apiKey || !deps.projectId) throw new CollectorError("OpenSEO är inte konfigurerat (OPENSEO_API_KEY och OPENSEO_PROJECT_ID).");
  const before = await creditsRemaining(deps);
  if (before !== null && before < MIN_CREDITS) throw new CollectorError(`OpenSEO har bara ${before} krediter kvar (gränsen är ${MIN_CREDITS}).`);

  const budget = opts.budget ?? AGENCY_CREDIT_BUDGET;
  if (budget < CREDITS_PER_PAGE_GUESS) throw new CollectorError("Dygnets tak för OpenSEO-krediter är nått.");
  const rows: BacklinkRow[] = [];
  let total = 0;
  let pages = 0;
  let creditsLeft = before;
  let more = false;
  for (let page = 1; page <= (opts.maxPages ?? MAX_PAGES); page++) {
    // Nästa sida får inte ta oss över budgeten, och aldrig under reserven.
    const used = before !== null && creditsLeft !== null ? before - creditsLeft : pages * CREDITS_PER_PAGE_GUESS;
    if (page > 1 && used + CREDITS_PER_PAGE_GUESS > budget) { more = true; break; }
    if (creditsLeft !== null && creditsLeft - CREDITS_PER_PAGE_GUESS < MIN_CREDITS) { more = true; break; }
    const r = await callTool("get_backlinks_profile", { projectId: deps.projectId, target: domain, scope: "subdomains", mode: "one_per_domain", pageSize: PAGE_SIZE, page, hideSpam: true, sortField: "firstSeen", sortOrder: "desc" }, deps, opts.signal);
    const got = rowsOf(r);
    rows.push(...got.rows);
    total = got.total;
    pages++;
    if (typeof r._meta?.creditsRemaining === "number") creditsLeft = r._meta.creditsRemaining;
    more = got.hasMore;
    if (!got.hasMore || got.rows.length === 0) break;
  }
  const creditsUsed = before !== null && creditsLeft !== null ? Math.max(0, before - creditsLeft) : pages * CREDITS_PER_PAGE_GUESS;
  return { rows, total, pages, creditsLeft, creditsUsed, more };
}
