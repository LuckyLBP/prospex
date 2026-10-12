import type { JobsSection } from "./jobs";
import type { Person } from "./people";
import type { PlaceHit } from "./places";
import { servicesFromFacts } from "./services";
import type { GatherResult } from "./gather";
import type { Resolved } from "./resolve";
import { Claim, type CompanyProfile, type Fact, type PageText, type ProfileCreator, type ProfileModelOutput, type ProfilePlatformLink, type ServiceItem } from "./types";

// Sätter ihop profilen och granskar det modellen skrivit. ALLT som modellen skriver passerar här, och det som
// inte håller kastas i stället för att visas:
//
//   - påståenden vars bevis-id inte finns bland fakta
//   - meningar med belopp, procent eller siffror om omsättning, resultat, anställda eller kapital som inte står
//     i underlaget (ekonomin kommer bara från Bolagsverket, kopierad av kod)
//   - meningar med e-postadresser eller telefonnummer (kontaktuppgifter kommer bara från koden)
//   - tankstreck, som byts mot komma
//
// Ren: samma indata ger samma profil.

const DASH = /\s*[–—]\s*/g;
const MONEY = /\d[\d\s., ]*\s?(?:kr\b|kronor|tkr|mkr|mnkr|msek|miljoner|miljard\w*|%|procent)/i;
const FINANCE_WORD = /omsättning|resultat|vinst|förlust|anställd|eget kapital|tillgångar|soliditet|marginal|intäkt/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+46|\b0)[\d\s\-()]{7,}\d/;

export function cleanText(s: string): string {
  return s.replace(DASH, ", ").replace(/\s+/g, " ").trim();
}

function digitsOf(s: string): string[] {
  return (s.match(/\d[\d\s., ]*\d|\d/g) ?? []).map((d) => d.replace(/[\s., ]/g, ""));
}

/** Får meningen stå kvar? `haystack` är allt som finns i underlaget (fakta och sidtext). */
export function sentenceAllowed(text: string, haystack: string): boolean {
  if (EMAIL.test(text) || PHONE.test(text)) return false;
  const digits = digitsOf(text);
  if (FINANCE_WORD.test(text) && digits.length > 0) return false;
  if (MONEY.test(text)) {
    const have = haystack.replace(/[\s., ]/g, "");
    if (digits.some((d) => d.length > 0 && !have.includes(d))) return false;
  }
  return true;
}

interface Ctx {
  factIds: Set<string>;
  haystack: string;
}

function keepClaim(c: { text: string; evidence: string[] }, ctx: Ctx): Claim | null {
  const text = cleanText(c.text);
  if (!text || c.evidence.length === 0 || !c.evidence.every((id) => ctx.factIds.has(id))) return null;
  if (!sentenceAllowed(text, ctx.haystack)) return null;
  return { text, evidence: [...new Set(c.evidence)] };
}

const keyOf = (s: Pick<ServiceItem, "name" | "supplier" | "category">) => `${(s.supplier ?? s.name).toLowerCase()}|${s.category}`;

export interface AssembleInput {
  resolved: Resolved;
  gathered: GatherResult;
  companyId: string | null;
  model: ProfileModelOutput | null;
  texts: PageText[];
  place: PlaceHit | null;
  meta: { model: string | null; inputTokens: number; outputTokens: number; steps: number; toolPages: string[]; durationMs: number; costEstimateSek: number | null; aiStatus: "ok" | "disabled" | "failed" | "skipped" };
  /** Facts as they stand after the AI step (it may have added some). */
  facts: Fact[];
  creator?: ProfileCreator | null;
  companyLogoPath?: string | null;
  platformLinks?: ProfilePlatformLink[];
  jobs?: JobsSection | null;
  people?: Person[];
  now?: Date;
}

export function assembleProfile(i: AssembleInput): CompanyProfile {
  const { resolved, gathered, facts } = i;
  const ctx: Ctx = { factIds: new Set(facts.map((f) => f.id)), haystack: [...facts.map((f) => f.value), ...i.texts.map((t) => t.text)].join(" \n ") };

  const ruleServices = servicesFromFacts(facts);
  const seen = new Set(ruleServices.map(keyOf));
  const aiServices: ServiceItem[] = [];
  for (const s of i.model?.services ?? []) {
    const evidence = [...new Set(s.evidence)];
    const name = cleanText(s.name);
    const basis = cleanText(s.basis);
    if (!name || !evidence.every((id) => ctx.factIds.has(id)) || !sentenceAllowed(`${name}. ${basis}`, ctx.haystack)) continue;
    const item: ServiceItem = { name, supplier: s.supplier ? cleanText(s.supplier) : null, category: s.category, basis, confidence: s.confidence === "trolig" ? "trolig" : "svag", evidence, origin: "ai" };
    if (seen.has(keyOf(item))) continue;
    seen.add(keyOf(item));
    aiServices.push(item);
  }

  const summaryText = i.model ? cleanText(i.model.summary) : "";
  const summary = summaryText && sentenceAllowed(summaryText, ctx.haystack) ? summaryText : null;

  const org = gathered.registry.organisation;
  const address = org?.address && !resolved.soleTrader ? [org.address.street, [org.address.postalCode, org.address.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null;

  const warnings = [...new Set([...resolved.warnings, ...gathered.warnings])];
  if (org?.advertisingBlocked) warnings.push("Reklamspärr hos SCB: företaget har bett att slippa adresserad reklam.");
  if (resolved.soleTrader) warnings.push("Enskild firma: organisationsnumret är ett personnummer och visas bara med födelsedatum, och uppgifter om hemadress visas inte.");
  if (i.meta.aiStatus === "disabled") warnings.push("Sammanfattningen är avstängd eftersom AI inte är konfigurerat.");
  if (i.meta.aiStatus === "skipped") warnings.push("Det fanns inget att sammanfatta: ingen webbplats och inga uppgifter från Bolagsverket.");
  if (i.meta.aiStatus === "failed") warnings.push("AI:n kunde inte skriva sammanfattningen, så profilen visar bara det koden hittat.");

  const domain = gathered.siteDomain ?? resolved.domain;
  return {
    version: 1,
    generatedAt: (i.now ?? new Date()).toISOString(),
    company: {
      id: i.companyId,
      name: org?.name ?? resolved.name ?? gathered.contact.companyName,
      orgnr: resolved.orgnrDisplay,
      soleTrader: resolved.soleTrader,
      domain,
      website: gathered.site.url ?? (domain ? `https://${domain}` : null),
      websiteSource: resolved.websiteSource,
      websiteVerified: gathered.websiteVerified,
    },
    overview: {
      summary,
      offering: (i.model?.offering ?? []).map((c) => keepClaim(c, ctx)).filter((c): c is Claim => !!c),
      audience: i.model?.audience ? keepClaim(i.model.audience, ctx) : null,
    },
    registry: gathered.registry,
    website: gathered.site,
    marketing: { tech: gathered.marketingTech, social: gathered.social },
    services: [...ruleServices, ...aiServices],
    contact: {
      phones: gathered.contact.phones,
      emails: gathered.contact.emails,
      people: i.people ?? [],
      address,
      place: i.place ? { name: i.place.name, address: i.place.address, phone: i.place.phone, mapsUrl: i.place.mapsUrl, rating: i.place.rating ?? null, ratingCount: i.place.ratingCount ?? null, hours: i.place.hours ?? [], category: i.place.category ?? null } : null,
    },
    observations: (i.model?.observations ?? []).map((c) => keepClaim(c, ctx)).filter((c): c is Claim => !!c),
    talkingPoints: (i.model?.talkingPoints ?? []).map((c) => keepClaim(c, ctx)).filter((c): c is Claim => !!c).slice(0, 5),
    creator: i.creator ?? null,
    companyLogoPath: i.companyLogoPath ?? null,
    platformLinks: i.platformLinks ?? [],
    jobs: i.jobs ?? null,
    facts,
    meta: { ...i.meta, warnings },
  };
}
