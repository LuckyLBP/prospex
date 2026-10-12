import { unzipSync, strFromU8 } from "fflate";
import { listDocuments, mapOrganisation, parseAnnualFigures, type DocumentRef } from "./map";
import type { AnnualFigures, CompanyRegistry } from "./types";

/**
 * Bolagsverkets API för värdefulla datamängder: avgiftsfritt, OAuth 2.0 med
 * client credentials, 60 anrop per minut per kund.
 *
 * Adresserna och scopet står i Bolagsverkets anslutningsanvisning (v1.01,
 * 2025-02-10) och i OpenAPI-specifikationen på portal.api.bolagsverket.se.
 * BOLAGSVERKET_ENV=test pekar mot acceptansmiljön, som bara svarar på
 * Bolagsverkets egna testnummer.
 */

const ENVIRONMENTS = {
  prod: {
    token: "https://portal.api.bolagsverket.se/oauth2/token",
    api: "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1",
  },
  test: {
    token: "https://portal-accept2.api.bolagsverket.se/oauth2/token",
    api: "https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1",
  },
} as const;

const SCOPE = "vardefulla-datamangder:read";
const TIMEOUT_MS = 15_000;
/** 60 per minut; lite marginal, eftersom flera anrop kan vara i luften. */
const MIN_INTERVAL_MS = 1_100;
/** En årsredovisning är ett zip-paket på några hundra kB. Större än så är inte en årsredovisning. */
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export class BolagsverketError extends Error {
  constructor(
    message: string,
    /** Tillfälligt: försök igen senare. Annars är felet konfiguration eller behörighet. */
    readonly temporary: boolean,
  ) {
    super(message);
  }
}

export function isBolagsverketConfigured(): boolean {
  return Boolean(process.env.BOLAGSVERKET_CLIENT_ID && process.env.BOLAGSVERKET_CLIENT_SECRET);
}

/**
 * Acceptansmiljön svarar 400 på varje riktigt org.nr. Det svaret får aldrig
 * sparas på en post: det läses som "Bolagsverket känner inte till numret" och
 * skulle ligga kvar i en vecka respektive 30 dagar efter bytet till produktion.
 */
export function isBolagsverketTest(): boolean {
  return process.env.BOLAGSVERKET_ENV === "test";
}

function environment() {
  return isBolagsverketTest() ? ENVIRONMENTS.test : ENVIRONMENTS.prod;
}

/** Tio siffror, som API:et vill ha dem. "556677-8899" -> "5566778899". */
export function toIdentity(orgnr: string): string | null {
  const digits = orgnr.replace(/\D/g, "");
  if (digits.length === 12 && /^(16|19|20)/.test(digits)) return digits.slice(2);
  return digits.length === 10 ? digits : null;
}

// ------------------------------------------------------------------ token

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const id = process.env.BOLAGSVERKET_CLIENT_ID;
  const secret = process.env.BOLAGSVERKET_CLIENT_SECRET;
  if (!id || !secret) throw new BolagsverketError("Bolagsverkets API är inte konfigurerat.", false);

  const response = await fetch(environment().token, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  }).catch(() => null);

  if (!response) throw new BolagsverketError("Bolagsverket svarade inte.", true);
  if (response.status === 400 || response.status === 401) {
    throw new BolagsverketError("Bolagsverket godkände inte appens nycklar.", false);
  }
  if (!response.ok) throw new BolagsverketError(`Bolagsverket svarade ${response.status}.`, true);

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new BolagsverketError("Bolagsverket skickade ingen token.", true);
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

// ------------------------------------------------------------------ anrop

let nextSlot = 0;

/** Håller takten under 60 anrop per minut inom en instans. */
async function pace(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function call(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  await pace();
  const token = await accessToken();
  const response = await fetch(`${environment().api}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, accept: "application/json, application/zip" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  }).catch(() => null);

  if (!response) throw new BolagsverketError("Bolagsverket svarade inte.", true);
  // En token som gått ut i förtid: hämta en ny, en gång.
  if (response.status === 401 && !retried) {
    cachedToken = null;
    return call(path, init, true);
  }
  if (response.status === 429) throw new BolagsverketError("För många frågor till Bolagsverket just nu.", true);
  if (response.status === 401 || response.status === 403) {
    throw new BolagsverketError("Appen saknar behörighet hos Bolagsverket.", false);
  }
  if (response.status >= 500) throw new BolagsverketError(`Bolagsverket svarade ${response.status}.`, true);
  return response;
}

function postJson(path: string, body: unknown): Promise<Response> {
  return call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

// ------------------------------------------------------------------ uppgifter

/**
 * Registeruppgifterna om ett företag, eller null när Bolagsverket inte känner
 * till numret. Kastar BolagsverketError när frågan inte gick att ställa.
 */
export async function getOrganisation(orgnr: string): Promise<CompanyRegistry | null> {
  const identity = toIdentity(orgnr);
  if (!identity) return null;

  const response = await postJson("/organisationer", { identitetsbeteckning: identity });
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) throw new BolagsverketError(`Bolagsverket svarade ${response.status}.`, true);

  const company = mapOrganisation(await response.json(), identity);
  // Varken namn eller form, men fel från källorna: ett avbrott, inte ett svar.
  if (company && !company.name && !company.legalForm && company.unavailable.length > 0) {
    throw new BolagsverketError("Bolagsverket kunde inte hämta uppgifterna just nu.", true);
  }
  return company;
}

/**
 * Nyckeltalen ur den senaste digitalt inlämnade årsredovisningen, eller null
 * när det inte finns någon. Bara årsredovisningar enligt K2, K3 eller ESEF
 * finns i API:et -- ett bolag som lämnat in på papper har ingen här.
 */
export async function getAnnualFigures(orgnr: string): Promise<AnnualFigures | null> {
  const identity = toIdentity(orgnr);
  if (!identity) return null;

  const listResponse = await postJson("/dokumentlista", { identitetsbeteckning: identity });
  if (listResponse.status === 400 || listResponse.status === 404) return null;
  if (!listResponse.ok) throw new BolagsverketError(`Bolagsverket svarade ${listResponse.status}.`, true);

  const documents = listDocuments(await listResponse.json());
  const latest = documents[0];
  if (!latest) return null;

  const figures = await figuresFromDocument(latest);
  if (!figures) return null;

  // En äldre årsredovisning ger två år till (årets och jämförelseåret), så en räcker för tre eller fyra år.
  const olderThan = figures.previous?.periodEnd ?? figures.periodEnd;
  const older = documents.find((d) => d.periodEnd < olderThan);
  if (older) {
    const more = await figuresFromDocument(older).catch(() => null);
    if (more) figures.history = [more, ...(more.previous ? [more.previous] : [])].map(({ periodEnd, revenue, profit, employees, equity }) => ({ periodEnd, revenue, profit, employees, equity }));
  }
  return figures;
}

/** Nyckeltalen ur en enskild årsredovisning, eller null när filen inte går att läsa. */
async function figuresFromDocument(document: DocumentRef): Promise<AnnualFigures | null> {
  const fileResponse = await call(`/dokument/${encodeURIComponent(document.id)}`);
  if (fileResponse.status === 404) return null;
  if (!fileResponse.ok) throw new BolagsverketError(`Bolagsverket svarade ${fileResponse.status}.`, true);

  const bytes = new Uint8Array(await fileResponse.arrayBuffer());
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return null;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => /\.(x?html?)$/i.test(file.name) });
  } catch {
    return null;
  }

  // Paketet kan innehålla både årsredovisningen och revisionsberättelsen. Den
  // med resultaträkningens taggar är den som gäller.
  for (const content of Object.values(files)) {
    const html = strFromU8(content);
    if (!/ix:nonFraction/i.test(html)) continue;
    const figures = parseAnnualFigures(html, document.periodEnd, document.registeredAt);
    if (figures) return figures;
  }
  return null;
}
