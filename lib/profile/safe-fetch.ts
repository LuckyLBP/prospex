import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { readCapped } from "@/lib/enrich/site";
import { isAllowedPublicUrl, isAllowedUrl, isPublicAddress } from "./safe-url";
import type { Headers } from "./detectors";

// Hämtning av sidor för en profil, med skydd mot att nå interna adresser. Två lager:
//
//   1. isAllowedUrl på varje adress, också efter varje omdirigering (som hanteras för hand, högst tre hopp), så
//      att en sida inte kan skicka oss vidare till en annan domän eller en IP-adress.
//   2. Ett eget namnuppslag som slår upp ALLA adresser för värden och nekar om någon av dem inte är offentlig.
//      Den adress vi kontrollerat är den vi ansluter till, så en domän som svarar olika vid två uppslag (DNS
//      rebinding) kommer inte förbi.
//
// Samma tak som sajtbesöken i övrigt: 8 s per förfrågan, 512 kB och bara HTML.

const TIMEOUT_MS = 8_000;
const MAX_HOPS = 3;
export const USER_AGENT = "Mozilla/5.0 (compatible; ProspexBot/1.0; +https://prospex.se)";
const KEEP_HEADERS = ["server", "x-powered-by", "cf-ray", "x-vercel-id", "x-nf-request-id", "x-kinsta-cache", "via", "content-type"];

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

/** Namnuppslaget som nekar allt som inte är en offentlig adress. Exporterat för test. */
export function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      const blocked = new Error(`Adressen för ${hostname} är inte offentlig.`) as NodeJS.ErrnoException;
      blocked.code = "EBLOCKED";
      return callback(blocked);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

const dispatcher = new Agent({ connect: { lookup: guardedLookup as never }, headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS });

/** Hur många sidor en profil får hämta, och hur många av dem som får väljas av modellen. */
export class PageBudget {
  used = 0;
  byModel = 0;
  constructor(readonly total = 8, readonly modelTotal = 4) {}
  take(via: "code" | "model"): boolean {
    if (this.used >= this.total) return false;
    if (via === "model" && this.byModel >= this.modelTotal) return false;
    this.used++;
    if (via === "model") this.byModel++;
    return true;
  }
}

export interface SafePage {
  url: string;
  finalUrl: string;
  status: number;
  /** Null när svaret inte var HTML eller inte gick att läsa. */
  html: string | null;
  headers: Headers;
  /** Varför ingen sida hämtades, i klartext. */
  problem: string | null;
}

const miss = (url: string, problem: string, status = 0, finalUrl = url): SafePage => ({ url, finalUrl, status, html: null, headers: {}, problem });

/** Hämtar en sida inom `boundary`. Kastar aldrig: allt som går fel blir en `problem`. */
export async function safeFetch(url: string, boundary: string, budget: PageBudget, via: "code" | "model" = "code"): Promise<SafePage> {
  if (!isAllowedUrl(url, boundary)) return miss(url, "Adressen ligger utanför företagets webbplats.");
  if (!budget.take(via)) return miss(url, "Gränsen för antal sidor är nådd.");

  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(current, {
        dispatcher,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8" },
      });
    } catch (e) {
      const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
      return miss(url, code === "EBLOCKED" ? "Adressen går inte att nå (inte en offentlig adress)." : "Webbplatsen svarade inte.", 0, current);
    }

    const headers: Headers = {};
    for (const k of KEEP_HEADERS) {
      const v = response.headers.get(k);
      if (v) headers[k] = v;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) return { url, finalUrl: current, status: response.status, html: null, headers, problem: "Omdirigering utan mål." };
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { url, finalUrl: current, status: response.status, html: null, headers, problem: "Ogiltig omdirigering." };
      }
      if (!isAllowedUrl(next, boundary)) return { url, finalUrl: next, status: response.status, html: null, headers, problem: "Omdirigeringen leder utanför företagets webbplats." };
      current = next;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { url, finalUrl: current, status: response.status, html: null, headers, problem: `Webbplatsen svarade ${response.status}.` };
    }
    const type = response.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml/i.test(type)) {
      await response.body?.cancel().catch(() => {});
      return { url, finalUrl: current, status: response.status, html: null, headers, problem: "Svaret var inte en webbsida." };
    }
    const html = await readCapped(response as unknown as Response);
    return { url, finalUrl: current, status: response.status, html, headers, problem: html ? null : "Sidan var tom." };
  }
  return miss(url, "För många omdirigeringar.");
}

// ---------------------------------------------------------------- bilder

export interface SafeBytes {
  ok: boolean;
  bytes: Uint8Array | null;
  contentType: string | null;
  finalUrl: string;
  problem: string | null;
}

/** Läser högst `max` bytes ur ett svar och slutar dra i strömmen. Null om svaret är större. Exporterad för test. */
export async function readBytesCapped(response: Response, max: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const bad = (url: string, problem: string, finalUrl = url): SafeBytes => ({ ok: false, bytes: null, contentType: null, finalUrl, problem });

/**
 * Hämtar en bild (eller annan liten fil) från en offentlig adress, på vilken domän som helst. Samma skydd som
 * safeFetch: nämnduppslaget nekar allt som inte är en offentlig adress, omdirigeringar följs för hand (högst
 * tre) och kontrolleras vid varje hopp. Tak för storlek och bara de angivna filtyperna.
 */
export async function safeFetchBytes(url: string, opts: { maxBytes?: number; types?: RegExp } = {}): Promise<SafeBytes> {
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const types = opts.types ?? /^image\/(?:png|jpe?g|webp|gif)\b/i;
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!isAllowedPublicUrl(current)) return bad(url, "Adressen är inte en offentlig webbadress.", current);
    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(current, { dispatcher, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": USER_AGENT, Accept: "image/png,image/webp,image/jpeg,image/gif" } });
    } catch (e) {
      const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
      return bad(url, code === "EBLOCKED" ? "Adressen går inte att nå (inte en offentlig adress)." : "Servern svarade inte.", current);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) return bad(url, "Omdirigering utan mål.", current);
      try {
        current = new URL(location, current).toString();
      } catch {
        return bad(url, "Ogiltig omdirigering.", current);
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return bad(url, `Servern svarade ${response.status}.`, current);
    }
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!types.test(type)) {
      await response.body?.cancel().catch(() => {});
      return bad(url, "Svaret var inte en bild av en tillåten typ.", current);
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => {});
      return bad(url, "Bilden är för stor.", current);
    }
    const bytes = await readBytesCapped(response as unknown as Response, maxBytes);
    return bytes ? { ok: true, bytes, contentType: type, finalUrl: current, problem: null } : bad(url, "Bilden är för stor eller tom.", current);
  }
  return bad(url, "För många omdirigeringar.");
}
