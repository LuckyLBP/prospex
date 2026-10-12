export type CallOutcome =
  | "no_answer" | "busy" | "wrong_number" | "callback" | "meeting_booked" | "customer"
  | "not_interested" | "existing_customer" | "not_relevant" | "skip_number"
  // Äldre värden: visas som not_relevant, men finns kvar i importerad historik.
  | "not_customer" | "no_website";

/** Alla värden databasens check-constraint tillåter. */
export const ALL_OUTCOME_VALUES: readonly CallOutcome[] = [
  "no_answer", "busy", "wrong_number", "callback", "meeting_booked", "customer",
  "not_interested", "existing_customer", "not_relevant", "skip_number", "not_customer", "no_website",
];

/** De tre grupperna i formuläret, i den ordning ett samtal går. */
export type OutcomeGroup = "unreached" | "talked" | "closed";

export const OUTCOME_GROUPS: readonly { value: OutcomeGroup; label: string }[] = [
  { value: "unreached", label: "Nådde inte" },
  { value: "talked", label: "Pratade" },
  { value: "closed", label: "Avsluta" },
];

export interface OutcomeInfo {
  value: CallOutcome;
  /** Vad säljaren ser på knappen. */
  label: string;
  group: OutcomeGroup;
  /** Samma familjer som badge.tsx: neutral/primary/success/warning/danger. */
  tone: "neutral" | "primary" | "success" | "warning" | "danger";
  /** Avslutar arbetet med posten -- "Arkivera"-rutan förkryssas, men aldrig
   *  tyst: se scrape_log_call, som bara arkiverar när formuläret ber om det. */
  terminal: boolean;
  /** Erbjuder ett återkomstdatum i formuläret. Inte bara "Ring igen" -- "Ej
   *  svar, ring imorgon" är minst lika vanligt. */
  callback: boolean;
  /** Kräver mötets datum och tid i formuläret. */
  meeting: boolean;
  /** Siffran i <Kbd> och den tangent som utlöser knappen. */
  key: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0";
}

/**
 * De tio utfallen, i den ordning de visas och i den ordning tangenterna
 * 1-9 och 0 träffar dem. Grupperade efter hur samtalet gick: nådde inte,
 * pratade, avsluta. Ordningen är densamma överallt -- knapparna, tangentbords-
 * genomgången och historiken -- så att man kan följa listan med blicken utan
 * att läsa varje etikett.
 *
 * Etiketterna (2026-10-05) följer hur säljarna faktiskt använde dem: "Kund"
 * var alltid en försäljning, och "Ej kund"/"Finns ej sida" var nästan alltid
 * "kasta".
 */
export const OUTCOMES: readonly OutcomeInfo[] = [
  { value: "no_answer", label: "Ej svar", group: "unreached", tone: "neutral", terminal: false, callback: true, meeting: false, key: "1" },
  { value: "busy", label: "Upptaget", group: "unreached", tone: "neutral", terminal: false, callback: true, meeting: false, key: "2" },
  { value: "wrong_number", label: "Fel nummer", group: "unreached", tone: "danger", terminal: true, callback: false, meeting: false, key: "3" },
  { value: "callback", label: "Ring igen", group: "talked", tone: "warning", terminal: false, callback: true, meeting: false, key: "4" },
  { value: "meeting_booked", label: "Möte bokat", group: "talked", tone: "primary", terminal: false, callback: false, meeting: true, key: "5" },
  { value: "customer", label: "Såld – blev kund", group: "talked", tone: "success", terminal: true, callback: false, meeting: false, key: "6" },
  { value: "not_interested", label: "Ej intresserad", group: "talked", tone: "danger", terminal: true, callback: false, meeting: false, key: "7" },
  { value: "existing_customer", label: "Redan kund hos oss", group: "closed", tone: "neutral", terminal: true, callback: false, meeting: false, key: "8" },
  { value: "not_relevant", label: "Kasta – inte aktuell", group: "closed", tone: "danger", terminal: true, callback: false, meeting: false, key: "9" },
  { value: "skip_number", label: "Ringer ej numret", group: "closed", tone: "neutral", terminal: true, callback: false, meeting: false, key: "0" },
];

/**
 * Utfall som inte längre erbjuds men finns i historiken -- loggen skrivs
 * aldrig om. De visas som det utfall de i praktiken var.
 */
const LEGACY: Partial<Record<CallOutcome, CallOutcome>> = {
  not_customer: "not_relevant",
  no_website: "not_relevant",
};

const BY_VALUE = new Map(OUTCOMES.map((o) => [o.value, o]));

export function outcomeInfo(outcome: CallOutcome): OutcomeInfo {
  const info = BY_VALUE.get(LEGACY[outcome] ?? outcome);
  if (!info) throw new Error(`Okänt utfall: ${outcome}`);
  return info;
}

export function outcomeLabel(outcome: CallOutcome | null): string {
  return outcome ? outcomeInfo(outcome).label : "Inte ringd";
}

/** Ett utfall och de äldre värden som visas som det -- för filter. */
export function outcomeAliases(outcome: CallOutcome): CallOutcome[] {
  return [outcome, ...Object.entries(LEGACY).filter(([, to]) => to === outcome).map(([from]) => from as CallOutcome)];
}
