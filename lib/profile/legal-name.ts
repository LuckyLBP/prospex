import { decodeEntities } from "@/lib/enrich/extract";

// Bolagsnamnet som en webbplats själv skriver ut, för att kunna slå upp företaget när inget org.nr står på sidan.
// Sidfoten på sabygg.nu säger till exempel "SA Konstruktion & Bygg AB Åkermans väg 3 504 31 Borås". Rent och testat.
//
// Ett namn är en följd av ord med stor bokstav som slutar på en bolagsform (AB, HB, KB ...), och adressen är det som
// står strax efter: gata, postnummer och ort. Ort och postnummer används för att avgöra att det är rätt företag.

export interface LegalNameCandidate {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  source: "json-ld" | "text";
}

const SUFFIX = /^(?:AB|Aktiebolag|HB|Handelsbolag|KB|Kommanditbolag)$/i;
const CONNECTOR = /^(?:&|&amp;|och|i|of|and|\+)$/i;
const NAME_WORD = /^[\p{Lu}0-9][\p{L}0-9&.'’\-/]*$/u;
const SENTENCE_END = /[.!?:;]$/;
const MAX_WORDS = 7;
/** Ord som står före bolagsnamnet i sidfötter och kontaktrutor men inte hör till det. */
const UI_WORDS = new Set([
  "följ", "kontakt", "kontakta", "copyright", "besök", "hem", "om", "telefon", "tel", "adress", "postadress", "besöksadress", "fakturaadress", "org", "mail",
  "e-post", "epost", "läs", "mer", "välkommen", "hos", "vår", "våra", "företag", "företaget", "bolag", "bolaget", "ägs", "drivs", "av", "©", "alla", "rättigheter", "reserverade",
  "integritetspolicy", "cookies", "sverige", "sweden", "ring", "boka", "sök", "meny", "nyheter", "karriär", "jobba", "oss", "med", "för", "till",
]);
const AFTER = 130;

const COUNTRY = /^(?:Sverige|Sweden|Suomi|Norge|Danmark|Org|Orgnr|Org\.nr|Tel|Telefon|Fax|Mail|Epost|E-post|Kontakt|Besök|Öppettider|Vat|Moms)$/i;
const POSTAL_CITY = /(\d{3})\s?(\d{2})\s+([\p{Lu}][\p{L}\-]+(?:\s[\p{Lu}][\p{L}\-]+)?)/u;
const STREET = /([\p{Lu}][\p{L}.\-]*(?:\s[\p{L}.\-]+){0,3}\s+\d+\s?[A-Za-z]?)\s*,?\s*$/u;

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Texten på en sida utan taggar, skript och formatmallar, med radbrytningar som mellanrum. */
function visibleText(html: string): string {
  return decodeEntities(html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Bolagsnamn med adress ur JSON-LD: `legalName` eller `name` som slutar på en bolagsform. */
function fromJsonLd(html: string): LegalNameCandidate[] {
  const out: LegalNameCandidate[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      const name = [o.legalName, o.name].find((n): n is string => typeof n === "string" && /\b(?:AB|Aktiebolag|HB|Handelsbolag|KB|Kommanditbolag)\b\.?$/i.test(n.trim()));
      if (name) {
        const a = (o.address ?? {}) as Record<string, unknown>;
        let street = typeof a.streetAddress === "string" ? a.streetAddress.trim() : null;
        let postalCode = typeof a.postalCode === "string" ? a.postalCode.replace(/\s/g, "") : null;
        let city = typeof a.addressLocality === "string" ? a.addressLocality : null;
        // Slarvig JSON-LD lägger hela adressen i gatufältet ("Knallegatan 10, 441 51 Alingsås"): dela upp den.
        const whole = street ? POSTAL_CITY.exec(street) : null;
        if (street && whole) {
          if (!postalCode) postalCode = `${whole[1]}${whole[2]}`;
          street = street.slice(0, whole.index).replace(/[,\s]+$/, "") || null;
          if (!city) city = whole[3];
        }
        out.push({ name: name.trim(), street, postalCode, city, source: "json-ld" });
      }
      for (const v of Object.values(o)) walk(v);
    };
    walk(data);
  }
  return out;
}

/** Namnet som slutar på ordet vid `end`, uppbyggt bakåt, eller null. */
function nameBefore(words: string[], end: number): string | null {
  const parts: string[] = [words[end]];
  for (let i = end - 1; i >= 0 && parts.length < MAX_WORDS; i--) {
    const w = words[i];
    // Ett ord som slutar en mening hör till föregående mening.
    if (SENTENCE_END.test(w) && !/^[\p{Lu}]\.$/u.test(w)) break;
    // Ett årtal eller ett copyrighttecken före namnet ("© 2026 Företaget AB") hör inte till det.
    if (/^\d{4}$/.test(w) || w === "©" || /^\(c\)$/i.test(w)) break;
    if (CONNECTOR.test(w) || NAME_WORD.test(w)) parts.unshift(w);
    else break;
  }
  // Ett postnummer och en ort ("441 51 Alingsås") före namnet hör till föregående adress.
  while (parts.length > 3 && /^\d{3}$/.test(parts[0]) && /^\d{2}$/.test(parts[1])) parts.splice(0, 3);
  // Rubriker och knappar före namnet ("Följ", "Kontakta", "Copyright") och bindeord i början hör inte till det.
  while (parts.length > 1 && (CONNECTOR.test(parts[0]) || UI_WORDS.has(parts[0].toLowerCase()))) parts.shift();
  const words2 = parts.filter((p) => !CONNECTOR.test(p) && !SUFFIX.test(p));
  return words2.length >= 1 ? parts.join(" ") : null;
}

/**
 * Bolagsnamn som sidorna själva skriver ut, med adress när den står strax efter. Bäst först: de med postnummer och ort
 * (och JSON-LD) före namn utan adress. Högst tre.
 */
export function findLegalNames(htmls: readonly string[]): LegalNameCandidate[] {
  const found = new Map<string, LegalNameCandidate>();
  const add = (c: LegalNameCandidate) => {
    const k = key(c.name);
    const cur = found.get(k);
    if (!cur || (!cur.postalCode && c.postalCode) || (cur.source === "text" && c.source === "json-ld")) found.set(k, c);
  };

  for (const html of htmls) {
    for (const c of fromJsonLd(html)) add(c);
    const text = visibleText(html);
    const words = text.split(" ");
    let offset = 0;
    const starts: number[] = [];
    for (const w of words) { starts.push(offset); offset += w.length + 1; }
    for (let i = 0; i < words.length; i++) {
      if (!SUFFIX.test(words[i].replace(/[.,;:]$/, ""))) continue;
      const name = nameBefore(words.map((w, j) => (j === i ? w.replace(/[.,;:]$/, "") : w)), i);
      if (!name || name.length < 4 || name.length > 80) continue;
      // Adressen ligger mellan namnet och nästa bolagsnamn, så att ett företag inte får nästa företags postnummer.
      const next = words.findIndex((w, j) => j > i && SUFFIX.test(w.replace(/[.,;:]$/, "")));
      const limit = Math.min(starts[i] + words[i].length + AFTER, next > 0 ? starts[next] : Infinity);
      const after = text.slice(starts[i] + words[i].length, limit);
      const pc = POSTAL_CITY.exec(after);
      const street = pc ? (STREET.exec(after.slice(0, pc.index).trim())?.[1]?.trim() ?? null) : null;
      // "Borås Sverige": landet hör inte till orten.
      const city = pc ? pc[3].split(" ").filter((p) => !COUNTRY.test(p)).join(" ") || null : null;
      add({ name, street, postalCode: pc ? `${pc[1]}${pc[2]}` : null, city, source: "text" });
    }
  }
  return [...found.values()]
    .sort((a, b) => Number(!!b.postalCode) - Number(!!a.postalCode) || Number(b.source === "json-ld") - Number(a.source === "json-ld"))
    .slice(0, 3);
}
