import { normalizeDomain } from "@/lib/scrapers/domain";
import { isValidOrgNumber, normalizeOrgNumber } from "@/lib/enrich/orgnr";
import { isIP } from "node:net";

// Vad någon skriver i profilfältet: ett organisationsnummer eller en webbadress. Rent och testat. Det är
// här regeln för enskilda firmor sitter, så att den går att ändra på ett ställe.

export type ProfileInput =
  | {
      kind: "orgnr";
      /** Hela numret, `XXXXXX-XXXX`. Används bara i minnet för uppslaget hos Bolagsverket och sparas aldrig för en enskild firma. */
      orgnr: string;
      /** Det som sparas och visas: numret, eller `ÅÅMMDD-****` för en enskild firma. */
      display: string;
      soleTrader: boolean;
    }
  | { kind: "url"; domain: string; url: string }
  | { kind: "error"; reason: "empty" | "invalid_orgnr" | "invalid_url" | "not_public_host"; message: string };

/** En enskild firmas organisationsnummer är personnumret, vars tredje siffra är en månad (0 eller 1). */
export function isSoleTraderNumber(orgnr: string): boolean {
  const digits = orgnr.replace(/\D/g, "");
  return digits.length === 10 && Number(digits[2]) < 2;
}

/** `670406-1234` blir `670406-****`. De fyra sista siffrorna lämnar aldrig minnet. */
export function maskOrgnr(orgnr: string): string {
  const digits = orgnr.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 6)}-****` : orgnr;
}

/** Org.nr som det får sparas och visas: maskat för en enskild firma, annars som det är. */
export function displayOrgnr(orgnr: string): string {
  return isSoleTraderNumber(orgnr) ? maskOrgnr(orgnr) : orgnr;
}

const ORGNR_SHAPE = /^(?:(?:16|19|20)\d{2}|\d{2})\d{4}[-\s]?\d{4}$/;
const LOCAL_SUFFIX = /\.(?:local|localhost|internal|lan|home|corp|intranet)$/i;

export function parseProfileInput(raw: string): ProfileInput {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "error", reason: "empty", message: "Ange en webbadress eller ett organisationsnummer." };

  // Ett nummer, med eller utan sekelsiffror, bindestreck eller blanksteg.
  if (/^[\d\s-]+$/.test(text)) {
    const compact = text.replace(/[\s]/g, "");
    if (!ORGNR_SHAPE.test(compact)) return { kind: "error", reason: "invalid_orgnr", message: "Organisationsnumret ska vara tio siffror, till exempel 556677-8899." };
    let digits = compact.replace(/-/g, "");
    if (digits.length === 12) digits = digits.slice(2);
    const orgnr = normalizeOrgNumber(digits);
    if (!orgnr || !isValidOrgNumber(orgnr)) return { kind: "error", reason: "invalid_orgnr", message: "Organisationsnumret stämmer inte (kontrollsiffran är fel)." };
    return { kind: "orgnr", orgnr, display: displayOrgnr(orgnr), soleTrader: isSoleTraderNumber(orgnr) };
  }

  const domain = normalizeDomain(text);
  if (!domain) return { kind: "error", reason: "invalid_url", message: "Det där ser inte ut som en webbadress. Skriv till exempel foretag.se." };
  if (isIP(domain) !== 0 || LOCAL_SUFFIX.test(domain)) return { kind: "error", reason: "not_public_host", message: "Bara offentliga webbadresser går att profilera." };
  return { kind: "url", domain, url: `https://${domain}` };
}
