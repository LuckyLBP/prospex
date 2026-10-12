// Modellens JSON är ibland nästan rätt. DeepSeek i kompatibilitetsläge har gett en klammer för mycket mitt i
// objektet ("...]},"observations":[...]}"), så att rotobjektet slutar för tidigt. Det här försöker laga sådant, och
// ger null när det inte går. Resultatet valideras ändå mot schemat efteråt, så en felaktig lagning kan inte
// släppa igenom något.

function stripFences(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

function parseError(text: string): { ok: true; value: unknown } | { ok: false; position: number | null } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const m = /position (\d+)/.exec((e as Error).message);
    return { ok: false, position: m ? Number(m[1]) : null };
  }
}

/** En lagad JSON-sträng, eller null. */
export function repairModelJson(raw: string): string | null {
  let text = stripFences(raw);
  const start = text.indexOf("{");
  if (start === -1) return null;
  text = text.slice(start);

  // Avslutande komman före en stängande klammer eller hakparentes.
  text = text.replace(/,\s*([}\]])/g, "$1");

  for (let attempt = 0; attempt < 4; attempt++) {
    const r = parseError(text);
    if (r.ok) return JSON.stringify(r.value);
    if (r.position === null) return null;
    // Objektet slutade vid position-1 och det finns mer text efter: ta bort den för tidiga klammern och fortsätt.
    const prev = r.position - 1;
    if (prev >= 0 && (text[prev] === "}" || text[prev] === "]") && /^\s*,/.test(text.slice(r.position))) {
      text = text.slice(0, prev) + text.slice(r.position);
      continue;
    }
    // Annars: bara skräp efter ett komplett objekt.
    const head = text.slice(0, r.position);
    return parseError(head).ok ? JSON.stringify((parseError(head) as { ok: true; value: unknown }).value) : null;
  }
  return null;
}

// ---------------------------------------------------------------- formfel

const FACT = /^F\d+$/;
const CATEGORIES = new Set(["webbplats", "drift", "annonsering", "analys", "e-post", "bokning", "e-handel", "betalning", "chatt", "övrigt"]);

const clip = (v: unknown, max: number): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trim();
};

function evidenceOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return [...new Set(list.filter((x): x is string => typeof x === "string" && FACT.test(x.trim())).map((x) => x.trim()))].slice(0, 6);
}

function claimOf(v: unknown): { text: string; evidence: string[] } | null {
  if (!v || typeof v !== "object") return null;
  const text = clip((v as { text?: unknown }).text, 400);
  const evidence = evidenceOf((v as { evidence?: unknown }).evidence);
  return text && evidence.length > 0 ? { text, evidence } : null;
}

const claims = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map(claimOf).filter((c): c is NonNullable<typeof c> => !!c).slice(0, max);

/**
 * Rättar formen på modellens svar utan att lägga till något: en lista där ett objekt skulle vara, ett enskilt
 * id där en lista skulle vara, för långa texter, okända kategorier. Poster utan text eller utan giltiga
 * belägg tas bort. Innehållet granskas ändå i assemble.ts. Ger null om svaret inte ens är ett objekt.
 */
export function coerceModelOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const audience = Array.isArray(o.audience) ? o.audience[0] : o.audience;
  const services = (Array.isArray(o.services) ? o.services : []).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const s = raw as Record<string, unknown>;
    const name = clip(s.name, 80);
    const evidence = evidenceOf(s.evidence);
    if (!name || evidence.length === 0) return [];
    return [{
      name, supplier: clip(s.supplier, 80) || null, category: typeof s.category === "string" && CATEGORIES.has(s.category) ? s.category : "övrigt",
      basis: clip(s.basis, 300), confidence: s.confidence === "trolig" ? "trolig" : s.confidence === "stark" ? "trolig" : "svag", evidence,
    }];
  }).slice(0, 6);
  return { summary: clip(o.summary, 700), offering: claims(o.offering, 8), audience: claimOf(audience), services, observations: claims(o.observations, 6), talkingPoints: claims(o.talkingPoints, 5) };
}
