import type { AnnualFigures, CodeLabel, CompanyRegistry, YearFigures } from "./types";

// ---------------------------------------------------------------------------
// Rena översättningar från Bolagsverkets svar till appens form. Ingen nätverks-
// trafik här, så allt går att testa mot sparade svar (fixtures/).
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** "2023-05-05T00:00:00.000+00:00" -> "2023-05-05". */
function day(value: unknown): string | null {
  const text = str(value);
  return text ? text.slice(0, 10) : null;
}

function codeLabel(value: unknown): CodeLabel | null {
  const o = obj(value);
  const code = str(o?.kod);
  const label = str(o?.klartext);
  return code || label ? { code: code ?? "", label: label ?? code ?? "" } : null;
}

function yesNo(value: unknown): boolean | null {
  const code = str(obj(value)?.kod);
  return code === "JA" ? true : code === "NEJ" ? false : null;
}

/** Svenska namn på uppgifterna, för raden "kunde inte hämtas". */
const DATASET_LABELS: Record<string, string> = {
  organisationsnamn: "namn",
  organisationsform: "bolagsform",
  avregistreradOrganisation: "avregistrering",
  pagaendeAvvecklingsEllerOmstruktureringsforfarande: "pågående förfaranden",
  pagandeAvvecklingsEllerOmstruktureringsforfarande: "pågående förfaranden",
  verksamOrganisation: "verksamhet",
  organisationsdatum: "registreringsdatum",
  verksamhetsbeskrivning: "verksamhetsbeskrivning",
  naringsgrenOrganisation: "bransch",
  postadressOrganisation: "adress",
  reklamsparr: "reklamspärr",
};

/**
 * Första organisationen i ett svar från POST /organisationer, eller null när
 * svaret inte innehåller någon.
 *
 * Varje uppgift kan bära ett eget `fel` när en av de två källorna (Bolagsverket
 * eller SCB) inte svarade. Det är inte ett fel på hela svaret: resten visas, och
 * det som saknas räknas upp i `unavailable`.
 */
export function mapOrganisation(response: unknown, requestedOrgnr: string): CompanyRegistry | null {
  const org = obj(arr(obj(response)?.organisationer)[0]);
  if (!org) return null;

  const unavailable = Object.entries(DATASET_LABELS)
    .filter(([key]) => obj(obj(org[key])?.fel))
    .map(([, label]) => label);

  // Hela svaret är fel om själva namnet och formen inte gick att få fram och
  // organisationen inte finns -- då finns inget att visa.
  const notFound = Object.keys(DATASET_LABELS).some(
    (key) => str(obj(obj(org[key])?.fel)?.typ) === "ORGANISATION_FINNS_EJ",
  );

  const names = arr(obj(org.organisationsnamn)?.organisationsnamnLista)
    .map(obj)
    .filter((n): n is Json => n !== null);
  const primary = names.find((n) => str(obj(n.organisationsnamntyp)?.kod) === "FORETAGSNAMN") ?? names[0];
  const otherNames = names
    .filter((n) => n !== primary)
    .map((n) => str(n.namn))
    .filter((n): n is string => n !== null);

  const legalForm = codeLabel(org.organisationsform);
  const name = str(primary?.namn);
  if (notFound && !name && !legalForm) return null;

  const proceedingsRoot = obj(org.pagaendeAvvecklingsEllerOmstruktureringsforfarande) ??
    obj(org.pagandeAvvecklingsEllerOmstruktureringsforfarande);
  const proceedings = arr(
    proceedingsRoot?.pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista ??
      proceedingsRoot?.pagandeAvvecklingsEllerOmstruktureringsforfarandeLista,
  )
    .map(obj)
    .filter((p): p is Json => p !== null)
    .map((p) => ({ label: str(p.klartext) ?? str(p.kod) ?? "Okänt förfarande", from: day(p.fromDatum) }));

  const address = obj(obj(org.postadressOrganisation)?.postadress);
  const postalCode = str(address?.postnummer);

  return {
    orgnr: str(obj(org.organisationsidentitet)?.identitetsbeteckning) ?? requestedOrgnr,
    name,
    otherNames,
    legalForm,
    registeredAt: day(obj(org.organisationsdatum)?.registreringsdatum),
    active: yesNo(org.verksamOrganisation),
    deregisteredAt: day(obj(org.avregistreradOrganisation)?.avregistreringsdatum),
    deregistrationReason: str(obj(org.avregistreringsorsak)?.klartext),
    proceedings,
    description: str(obj(org.verksamhetsbeskrivning)?.beskrivning),
    sni: arr(obj(org.naringsgrenOrganisation)?.sni)
      .map(codeLabel)
      .filter((s): s is CodeLabel => s !== null && s.code !== "00000"),
    address: postalCode
      ? {
          street: str(address?.utdelningsadress),
          postalCode,
          city: str(address?.postort),
          co: str(address?.coAdress),
        }
      : null,
    advertisingBlocked: yesNo(org.reklamsparr),
    unavailable,
  };
}

export interface DocumentRef {
  id: string;
  periodEnd: string;
  registeredAt: string | null;
}

/** Årsredovisningarna i ett svar från POST /dokumentlista, den nyaste först. */
export function listDocuments(response: unknown): DocumentRef[] {
  const docs = arr(obj(response)?.dokument)
    .map(obj)
    .filter((d): d is Json => d !== null)
    .map((d) => ({ id: str(d.dokumentId), periodEnd: day(d.rapporteringsperiodTom), registeredAt: day(d.registreringstidpunkt) }))
    .filter((d): d is DocumentRef => d.id !== null && d.periodEnd !== null);
  docs.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  return docs;
}

/** Den senaste årsredovisningen i ett svar från POST /dokumentlista. */
export function latestDocument(response: unknown): DocumentRef | null {
  return listDocuments(response)[0] ?? null;
}

// ---------------------------------------------------------------------------
// ÅRSREDOVISNINGEN. En digitalt inlämnad årsredovisning är en iXBRL-fil: en
// vanlig XHTML-sida där varje tal bär en tagg som säger vad det är
// (`se-gen-base:Nettoomsattning`) och vilken period det gäller (`contextRef`).
// Samma sida innehåller alltid jämförelseåret också, så perioden avgör vilket
// tal som är årets.
// ---------------------------------------------------------------------------

const FACTS = {
  revenue: "se-gen-base:Nettoomsattning",
  profit: "se-gen-base:AretsResultat",
  employees: "se-gen-base:MedelantaletAnstallda",
  equity: "se-gen-base:EgetKapital",
  totalAssets: "se-gen-base:Tillgangar",
  solidity: "se-gen-base:Soliditet",
  operatingProfit: "se-gen-base:Rorelseresultat",
} as const;

interface Context {
  end: string;
  /** En kontext med dimensioner (per aktieslag, per segment) är inte bolagets totala tal. */
  dimensional: boolean;
}

function parseContexts(html: string): Map<string, Context> {
  const contexts = new Map<string, Context>();
  const re = /<xbrli:context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/gi;
  for (const match of html.matchAll(re)) {
    const body = match[2];
    const end =
      /<xbrli:endDate>\s*([^<\s]+)\s*<\/xbrli:endDate>/i.exec(body)?.[1] ??
      /<xbrli:instant>\s*([^<\s]+)\s*<\/xbrli:instant>/i.exec(body)?.[1];
    if (!end) continue;
    contexts.set(match[1], { end: end.slice(0, 10), dimensional: /<xbrli:(segment|scenario)\b/i.test(body) });
  }
  return contexts;
}

function attr(tag: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? null;
}

/** "1 234 567" / "1.234,5" / "-" -> tal, enligt taggens `format`. */
export function parseIxNumber(text: string, format: string | null): number | null {
  const f = (format ?? "").toLowerCase();
  const plain = text.replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").trim();
  if (/zero|fixed-zero|zerodash/.test(f) || /^[-–—]$/.test(plain)) return 0;

  const commaDecimal = /comma-decimal|numdotcomma|numspacecomma|numcomma(?!dot)/.test(f);
  const decimal = commaDecimal ? "," : ".";
  const cleaned = plain.replace(new RegExp(`[^0-9${decimal === "," ? "," : "."}]`, "g"), "");
  const normalised = decimal === "," ? cleaned.replace(",", ".") : cleaned;
  if (!/\d/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/**
 * Årets nyckeltal ur en iXBRL-årsredovisning. `periodEnd` är dokumentlistans
 * `rapporteringsperiodTom`; utan den tas den senaste perioden i filen.
 */
export function parseAnnualFigures(
  html: string,
  periodEnd: string | null,
  registeredAt: string | null = null,
): AnnualFigures | null {
  const contexts = parseContexts(html);
  const ends = [...contexts.values()].filter((c) => !c.dimensional).map((c) => c.end);
  const end = periodEnd ?? ends.sort().at(-1) ?? null;
  if (!end) return null;

  const current = valuesFor(html, contexts, end);
  if (Object.keys(current).length === 0) return null;

  // Jämförelseåret ligger i samma fil: det senaste hela året före det aktuella.
  const previousEnd = [...new Set(ends)].filter((e) => e < end).sort().at(-1) ?? null;
  const before = previousEnd ? valuesFor(html, contexts, previousEnd) : {};
  const previous = previousEnd && Object.keys(before).length > 0 ? yearFigures(previousEnd, before) : null;

  return {
    ...yearFigures(end, current),
    registeredAt,
    totalAssets: current.totalAssets ?? null,
    solidity: current.solidity ?? null,
    operatingProfit: current.operatingProfit ?? null,
    previous,
  };
}

type Values = Partial<Record<keyof typeof FACTS, number>>;

function yearFigures(periodEnd: string, v: Values): YearFigures {
  return { periodEnd, revenue: v.revenue ?? null, profit: v.profit ?? null, employees: v.employees ?? null, equity: v.equity ?? null };
}

/** Talen i filen som gäller ett visst räkenskapsårs slut. */
function valuesFor(html: string, contexts: Map<string, Context>, end: string): Values {
  const values: Values = {};
  const re = /<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi;
  for (const match of html.matchAll(re)) {
    const tag = match[1];
    const name = attr(tag, "name");
    const key = (Object.keys(FACTS) as (keyof typeof FACTS)[]).find((k) => FACTS[k] === name);
    if (!key || values[key] !== undefined) continue;

    const context = contexts.get(attr(tag, "contextRef") ?? "");
    if (!context || context.dimensional || context.end !== end) continue;

    const raw = parseIxNumber(match[2], attr(tag, "format"));
    if (raw === null) continue;
    const scale = Number(attr(tag, "scale") ?? "0");
    let value = raw * 10 ** (Number.isFinite(scale) ? scale : 0);
    if (attr(tag, "sign") === "-") value = -value;
    // Soliditet lämnas ibland som andel (0,45) och ibland som procent (45).
    if (key === "solidity" && Math.abs(value) <= 1.5) value *= 100;
    values[key] = Math.round(value * 100) / 100;
  }
  return values;
}
