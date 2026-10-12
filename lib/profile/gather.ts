import { isIP } from "node:net";
import { BolagsverketError, getAnnualFigures, getOrganisation } from "@/lib/bolagsverket/client";
import { companyStatus, type CompanyRegistry } from "@/lib/bolagsverket/types";
import { refreshRegistry } from "@/lib/bolagsverket/registry";
import { auditSite, isOutdated, siteIssues } from "@/lib/enrich/audit";
import { extractContacts, isInterstitial, toText } from "@/lib/enrich/extract";
import { findOrgNumber, normalizeOrgNumber } from "@/lib/enrich/orgnr";
import { findLegalNames, type LegalNameCandidate } from "./legal-name";
import { resolveOrgnrByName, type LookupResult } from "./orgnr-lookup";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { classifyDns, lookupDns } from "./dns";
import { agencyKey, findFooterCredits, footerText, type CreditPhrase, type Creator } from "./creator";
import { classifyCredit, adminPlatformDomains, type Classification } from "@/lib/agencies/classify";
import { findCreditWithClaude, type FooterCreditResult } from "@/lib/agencies/footer-ai";
import { isWebPlatformDomain, knownPlatformLinks, WEB_PLATFORMS, type PlatformLink } from "./platforms";
import { detectTech } from "./detectors";
import { FactBook } from "./facts";
import { linkInventory, socialLinks, type InventoryLink, type SocialLink } from "./links";
import { changePercent } from "./format";
import { maskOrgnr } from "./input";
import { PageBudget, safeFetch, type SafePage } from "./safe-fetch";
import type { Detection, Fact, PageLog, PageText, RegistrySection, SiteSection, TechCategory } from "./types";
import { pool } from "@/lib/db";

// Samlar fakta om ett företag, utan AI: Bolagsverket, webbplatsen (startsidan plus högst två sidor till),
// DNS. Resultatet är allt som profilen vilar på, och det som AI:n får att arbeta med.

const MARKETING: TechCategory[] = ["annonsering", "analys", "säljverktyg", "samtycke", "marknadsautomation", "e-post"];
const PAGE_TEXT_LIMIT = 4000;

export interface GatherInput {
  /** Hela numret, bara i minnet. */
  orgnr: string | null;
  soleTrader: boolean;
  domain: string | null;
  companyId: string | null;
  /** Webbplatsen kommer från Places och är inte bekräftad. */
  websiteUnverified: boolean;
  registryCached: unknown;
}

export interface GatherDeps {
  safeFetch: typeof safeFetch;
  lookupDns: typeof lookupDns;
  getOrganisation: typeof getOrganisation;
  getAnnualFigures: typeof getAnnualFigures;
  refreshRegistry: typeof refreshRegistry;
  persistAudit: (companyId: string, audit: ReturnType<typeof auditSite>) => Promise<void>;
  /** Domäner en admin pekat ut som plattform, hosting eller verktyg. Utelämnat betyder inga. */
  adminPlatforms?: () => Promise<Set<string>>;
  /** Avgör om en kredit är en byrå eller något annat. Utelämnat betyder att reglerna i creator.ts gäller ensamma. */
  classifyCredit?: typeof classifyCredit;
  /** Claude läser sidfoten när reglerna inte hittar någon kredit. Utelämnat betyder att reglerna gäller ensamma. */
  footerCreditAi?: (html: string, siteDomain: string) => Promise<FooterCreditResult | null>;
  /** Hittar org.nr för ett bolagsnamn som webbplatsen anger, när inget org.nr står på sidan. Utelämnat betyder att det inte görs. */
  lookupOrgnr?: (candidates: readonly LegalNameCandidate[]) => Promise<LookupResult>;
  bolagsverket: { configured: boolean; test: boolean };
}

export interface GatherResult {
  facts: Fact[];
  registry: RegistrySection;
  site: SiteSection;
  marketingTech: Detection[];
  social: SocialLink[];
  inventory: InventoryLink[];
  /** Byrån som webbplatsen anger som skapare, med länk när den hittades. */
  creator: (Creator & { phrase: CreditPhrase; classification: Classification | null }) | null;
  platformLinks: PlatformLink[];
  dns: Detection[];
  contact: { phones: string[]; emails: string[]; companyName: string | null };
  pages: PageLog[];
  texts: PageText[];
  /** Sidor som kan visa kontaktpersoner: startsidan, kontakt, om oss och team- eller personalsidor. Rå HTML, för people.ts. */
  peoplePages: { url: string; html: string }[];
  orgnr: string | null;
  websiteVerified: boolean;
  siteDomain: string | null;
  warnings: string[];
  boundary: string | null;
  budget: PageBudget;
}

async function persistAudit(companyId: string, audit: ReturnType<typeof auditSite>): Promise<void> {
  await pool.query(`update companies set site_audit = $2::jsonb, site_audited_at = now(), site_outdated = $3 where id = $1`, [companyId, JSON.stringify(audit), isOutdated(audit)]);
}

export async function defaultGatherDeps(): Promise<GatherDeps> {
  const { isBolagsverketConfigured, isBolagsverketTest } = await import("@/lib/bolagsverket/client");
  return { safeFetch, lookupDns, getOrganisation, getAnnualFigures, refreshRegistry, persistAudit, adminPlatforms: () => adminPlatformDomains().catch(() => new Set<string>()), classifyCredit, footerCreditAi: (html, siteDomain) => findCreditWithClaude(html, siteDomain), lookupOrgnr: (c) => resolveOrgnrByName(c), bolagsverket: { configured: isBolagsverketConfigured(), test: isBolagsverketTest() } };
}

const PEOPLE_PATH = /(?:^|[/\-_])(?:team|teamet|personal|medarbetare|medarbetarna|ledning|ledningsgrupp|styrelse|behandlare|terapeuter|staff|people|om-mig|vilka-ar-vi|vilka-är-vi|vilka-vi-ar|vara-medarbetare|våra-medarbetare|vart-team|vårt-team|kontaktpersoner|ansvariga)(?:$|[/\-_?.])/i;
const PEOPLE_TEXT = /^(?:vårt team|teamet|våra medarbetare|medarbetare|personal|vilka är vi|ledning|ledningsgrupp|styrelse|om mig|kontaktpersoner|team)$/i;

/** Sidor med personer (team, personal, medarbetare, ledning, om mig) ur länkinventariet, utöver de som redan valts. Ren. */
export function pickPeoplePages(inventory: InventoryLink[], exclude: ReadonlySet<string>, max = 3): InventoryLink[] {
  const norm = (u: string) => u.replace(/\/$/, "").toLowerCase();
  return inventory
    .filter((l) => !exclude.has(norm(l.url)) && (PEOPLE_PATH.test(new URL(l.url).pathname) || PEOPLE_TEXT.test(l.text)))
    .slice(0, max);
}

/** Kontakt- och om-oss-sida ur länkinventariet, för de sidor koden hämtar utöver startsidan. Ren. */
export function pickExtraPages(inventory: InventoryLink[], max = 2): InventoryLink[] {
  const find = (re: RegExp) => inventory.find((l) => re.test(new URL(l.url).pathname) || re.test(l.text));
  const picks = [find(/kontakt|contact/i), find(/om-oss|om-foretaget|om-företaget|about|vilka-vi/i)].filter((x): x is InventoryLink => !!x);
  return [...new Map(picks.map((p) => [p.url, p])).values()].slice(0, max);
}

const money = (n: number | null) => (n === null ? null : `${Math.round(n).toLocaleString("sv-SE")} kr`);

function statusText(org: CompanyRegistry): string | null {
  const s = companyStatus(org);
  switch (s.kind) {
    case "active": return "Verksamt";
    case "deregistered": return `Avregistrerat${s.date ? ` ${s.date}` : ""}${s.reason ? ` (${s.reason})` : ""}`;
    case "proceeding": return `${s.label}${s.from ? ` från ${s.from}` : ""}`;
    case "inactive": return "Inte verksamt";
    default: return null;
  }
}

/** Bolagsverkets uppgifter som fakta. En enskild firma får bara ort, aldrig gatuadress. Ren. */
export function registryFacts(book: FactBook, org: CompanyRegistry, figures: RegistrySection["figures"], soleTrader: boolean): void {
  const src = "Bolagsverket";
  const add = (label: string, value: string | null, source = src) => value && book.add({ kind: "registry", label, value, source, detector: `registry:${label.toLowerCase()}` });
  add("Bolagsform", org.legalForm?.label ?? null);
  add("Registrerat hos Bolagsverket", org.registeredAt);
  add("Status", statusText(org));
  add("Bransch (SNI)", org.sni.slice(0, 3).map((s) => `${s.code} ${s.label}`).join("; ") || null);
  const a = org.address;
  add("Ort", a?.city ?? null);
  if (!soleTrader && a?.street) add("Adress", [a.street, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", "));
  add("Verksamhetsbeskrivning", org.description ? org.description.slice(0, 300) : null);
  if (org.advertisingBlocked) add("Reklamspärr", "Företaget har bett att slippa adresserad reklam");
  if (figures) {
    const s = `Bolagsverket, årsredovisning för räkenskapsår som slutar ${figures.periodEnd}`;
    add("Omsättning", money(figures.revenue), s);
    add("Årets resultat", money(figures.profit), s);
    add("Anställda (medeltal)", figures.employees === null ? null : String(figures.employees), s);
    add("Eget kapital", money(figures.equity), s);
    add("Summa tillgångar", money(figures.totalAssets), s);
    add("Soliditet", figures.solidity === null ? null : `${Math.round(figures.solidity)} %`, s);
    add("Rörelseresultat", money(figures.operatingProfit ?? null), s);
    const prev = figures.previous;
    if (prev) {
      const ps = `Bolagsverket, årsredovisning för räkenskapsår som slutar ${prev.periodEnd}`;
      add("Omsättning föregående år", money(prev.revenue), ps);
      add("Årets resultat föregående år", money(prev.profit), ps);
      add("Anställda föregående år", prev.employees === null ? null : String(prev.employees), ps);
      const growth = changePercent(figures.revenue, prev.revenue);
      add("Omsättningens förändring", growth === null ? null : `${growth > 0 ? "+" : ""}${growth} % mot föregående år`, s);
    }
    const older = (figures.history ?? []).filter((y) => y.revenue !== null);
    if (older.length > 0) add("Omsättning tidigare år", older.map((y) => `${y.periodEnd.slice(0, 4)}: ${money(y.revenue)}`).join("; "), "Bolagsverket, äldre årsredovisningar");
  }
}

function toSection(org: CompanyRegistry, soleTrader: boolean): NonNullable<RegistrySection["organisation"]> {
  const { orgnr, name, legalForm, registeredAt, active, deregisteredAt, deregistrationReason, proceedings, description, sni, advertisingBlocked, address } = org;
  return {
    orgnr: soleTrader ? maskOrgnr(orgnr) : (normalizeOrgNumber(orgnr) ?? orgnr), name, legalForm, registeredAt, active, deregisteredAt, deregistrationReason, proceedings, description, sni, advertisingBlocked,
    address: address ? { street: soleTrader ? null : address.street, postalCode: soleTrader ? null : address.postalCode, city: address.city } : null,
  };
}

async function gatherRegistry(i: GatherInput, d: GatherDeps, book: FactBook): Promise<RegistrySection> {
  const base: RegistrySection = { status: "no_orgnr", message: "Inget organisationsnummer att slå upp.", organisation: null, figures: null, figuresStatus: "not_fetched" };
  if (!i.orgnr) return base;
  if (!d.bolagsverket.configured) return { ...base, status: "not_configured", message: "Bolagsverket är inte konfigurerat." };
  if (d.bolagsverket.test) return { ...base, status: "test", message: "Bolagsverket är i testläge och känner inte igen riktiga organisationsnummer." };
  try {
    let org: CompanyRegistry | null;
    let figures: RegistrySection["figures"] = null;
    let figuresStatus: RegistrySection["figuresStatus"] = "not_fetched";
    if (i.soleTrader || !i.companyId) {
      // En enskild firma sparas aldrig i katalogens registerkolumn, och en årsredovisning finns inte.
      org = await d.getOrganisation(i.orgnr);
      figuresStatus = "not_applicable";
      if (!i.soleTrader && org) {
        figures = await d.getAnnualFigures(i.orgnr).catch((e) => { if (e instanceof BolagsverketError && e.temporary) return null; throw e; });
        figuresStatus = figures ? "ok" : "none_digital";
      }
    } else {
      const data = await d.refreshRegistry({ id: i.companyId, orgnr: i.orgnr, registry: i.registryCached }, { withFigures: true });
      org = data.organisation;
      figures = data.annualReport ?? null;
      figuresStatus = data.annualReport === undefined ? "not_fetched" : data.annualReport ? "ok" : "none_digital";
    }
    if (!org) return { ...base, status: "not_found", message: "Organisationsnumret hittades inte hos Bolagsverket." };
    registryFacts(book, org, figures, i.soleTrader);
    return { status: "ok", message: null, organisation: toSection(org, i.soleTrader), figures, figuresStatus };
  } catch (e) {
    const temporary = e instanceof BolagsverketError && e.temporary;
    return { ...base, status: "error", message: temporary ? "Bolagsverket svarade inte just nu." : "Bolagsverket kunde inte nås." };
  }
}

function pageProblemStatus(p: SafePage): SiteSection["status"] {
  if ([401, 403, 429, 503].includes(p.status)) return "blocked";
  return "unreachable";
}

const emptySite = (status: SiteSection["status"], message: string | null, domain: string | null): SiteSection => ({ status, message, domain, url: null, audit: null, tech: [] });

export async function gather(i: GatherInput, deps?: GatherDeps): Promise<GatherResult> {
  const d = deps ?? (await defaultGatherDeps());
  const book = new FactBook();
  const warnings: string[] = [];
  const pages: PageLog[] = [];
  const texts: PageText[] = [];
  const budget = new PageBudget();
  let orgnr = i.orgnr;
  let websiteVerified = !i.websiteUnverified;
  let domain = i.domain;
  let boundary = domain;
  let legalNames: LegalNameCandidate[] = [];

  const log = (p: SafePage, via: "code" | "model" = "code") => pages.push({ url: p.url, status: p.status, bytes: p.html?.length ?? 0, via, problem: p.problem });
  const result: GatherResult = {
    facts: [], registry: { status: "no_orgnr", message: null, organisation: null, figures: null, figuresStatus: "not_fetched" }, site: emptySite("none", "Ingen webbplats känd.", null),
    marketingTech: [], social: [], inventory: [], creator: null, platformLinks: [], dns: [], contact: { phones: [], emails: [], companyName: null }, pages, texts, peoplePages: [], orgnr, websiteVerified, siteDomain: null, warnings, boundary, budget,
  };

  // Webbplatsen och DNS parallellt med registret när org.nr redan är känt.
  const registryEarly = orgnr ? gatherRegistry({ ...i, orgnr }, d, book) : null;
  const dnsPromise = domain ? d.lookupDns(domain).then(classifyDns).catch(() => [] as Detection[]) : Promise.resolve([] as Detection[]);

  if (domain) {
    let home = await d.safeFetch(`https://${domain}`, boundary!, budget);
    log(home);
    if (!home.html && home.problem?.startsWith("Omdirigeringen leder utanför")) {
      const next = normalizeDomain(home.finalUrl);
      if (next && next !== domain && isIP(next) === 0) {
        warnings.push(`Webbplatsen omdirigerar till ${next}, som används i stället.`);
        domain = boundary = next;
        home = await d.safeFetch(`https://${domain}`, boundary, budget);
        log(home);
      }
    }
    if (!home.html && home.status === 0 && !home.problem?.includes("inte en offentlig")) {
      home = await d.safeFetch(`http://${domain}`, boundary!, budget);
      log(home);
    }

    if (!home.html) {
      result.site = emptySite(pageProblemStatus(home), home.problem, domain);
      if (result.site.status === "blocked") warnings.push("Webbplatsen släppte inte in oss, så teknik och innehåll saknas.");
    } else if (isInterstitial(home.html)) {
      result.site = emptySite("blocked", "Webbplatsen svarade med en robotkontroll i stället för sidan.", domain);
      warnings.push("Webbplatsen svarade med en robotkontroll, så teknik och innehåll saknas.");
    } else {
      const finalUrl = home.finalUrl;
      const allHtml: { page: SafePage; html: string }[] = [{ page: home, html: home.html }];
      const inventory = linkInventory(home.html, finalUrl, boundary!);
      for (const extra of pickExtraPages(inventory)) {
        const p = await d.safeFetch(extra.url, boundary!, budget, "code");
        log(p);
        if (p.html && !isInterstitial(p.html)) allHtml.push({ page: p, html: p.html });
      }
      // Team- och personalsidor hämtas också, men ger inga texter till AI:n, bara underlag för kontaktpersonerna.
      const have = new Set(allHtml.map(({ page }) => page.finalUrl.replace(/\/$/, "").toLowerCase()));
      const peopleExtra: { url: string; html: string }[] = [];
      for (const extra of pickPeoplePages(inventory, have)) {
        const p = await d.safeFetch(extra.url, boundary!, budget, "code");
        log(p);
        if (p.html && !isInterstitial(p.html)) peopleExtra.push({ url: p.finalUrl, html: p.html });
      }
      result.peoplePages = [...allHtml.map(({ page, html }) => ({ url: page.finalUrl, html })), ...peopleExtra];

      const found = allHtml.map(({ html }) => findOrgNumber(toText(html))).find((x) => x);
      if (i.websiteUnverified && orgnr && !i.soleTrader && found) {
        if (found === orgnr) websiteVerified = true;
        else {
          result.site = emptySite("mismatch", "Webbplatsen visar ett annat organisationsnummer än företaget.", domain);
          warnings.push(`Webbplatsen ${domain} visar org.nr ${found}, inte företagets, så den används inte.`);
        }
      }
      if (!orgnr && found) orgnr = found;
      // Inget org.nr på sidorna: bolagsnamnet som de skriver ut kan ändå slås upp längre ner.
      if (!orgnr) legalNames = findLegalNames(allHtml.map(({ html }) => html));

      if (result.site.status !== "mismatch") {
        const rawAudit = auditSite(home.html, finalUrl);
        const tech = new Map<string, Detection>();
        for (const { page, html } of allHtml) for (const t of detectTech({ html, headers: page === home ? home.headers : undefined })) if (!tech.has(t.id)) tech.set(t.id, t);

        // Vem som står bakom sajten läses en gång, och allt som visas (kreditfaktan, "Skapad av", tjänsteraden)
        // bygger på samma svar. En plattform är en teknik och hamnar bland teknikerna, inte som byrå.
        const adminPlatforms = (await d.adminPlatforms?.().catch(() => new Set<string>())) ?? new Set<string>();
        const credits = findFooterCredits(home.html, domain!, rawAudit.credit, (x) => isWebPlatformDomain(x, adminPlatforms));
        let agency = credits.agency;
        let classification: Classification | null = null;
        const platforms = [...credits.platforms];
        if (agency?.domain && d.classifyCredit) {
          classification = await d.classifyCredit({ name: agency.name, domain: agency.domain, phrase: agency.phrase, snippet: footerText(home.html) }).catch(() => null);
          // Något annat än en byrå är en teknik (plattform, hosting, verktyg) eller inte en kredit alls.
          if (classification?.kind && classification.kind !== "agency") {
            if (classification.kind !== "not-agency") platforms.push({ name: agency.name, url: agency.url, domain: agency.domain });
            agency = null;
            classification = null;
          }
        }
        // Hittade reglerna ingen kredit alls? Då får Claude läsa sidfotens länkar. Den kan bara peka ut en länk som finns.
        if (!agency && platforms.length === 0 && d.footerCreditAi) {
          const ai = await d.footerCreditAi(home.html, domain!).catch(() => null);
          if (ai?.role === "agency") {
            agency = { name: ai.name, url: ai.url, domain: ai.domain, phrase: "made-by" };
            classification = { kind: "agency", source: "ai", reason: ai.reason };
          } else if (ai?.role === "platform") {
            platforms.push({ name: ai.name, url: ai.url, domain: ai.domain });
          }
        }
        for (const p of platforms) {
          const id = `platform-${(p.domain ?? p.name).toLowerCase()}`;
          const known = WEB_PLATFORMS.find((w) => p.domain && (p.domain === w.domain || p.domain.endsWith(`.${w.domain}`)));
          const name = known?.name ?? p.name;
          if (![...tech.values()].some((t) => t.name.toLowerCase() === name.toLowerCase())) tech.set(id, { id, name, category: "cms", detail: "webbplattform", match: "länk i sidfoten" });
        }
        const detections = [...tech.values()];
        const audit = { ...rawAudit, credit: agency?.name ?? null };

        book.addAudit(audit, finalUrl);
        const headerIds = new Set(["cloudflare", "vercel", "netlify", "wpengine", "kinsta", "php"]);
        book.addDetections(detections.filter((t) => headerIds.has(t.id)), finalUrl, "header");
        book.addDetections(detections.filter((t) => !headerIds.has(t.id)), finalUrl);

        const contacts = allHtml.map(({ html }) => extractContacts(html, domain));
        result.contact = {
          phones: [...new Set(contacts.flatMap((c) => c.phones))].slice(0, 5),
          emails: [...new Set(contacts.flatMap((c) => c.emails))].slice(0, 5),
          companyName: contacts.map((c) => c.companyName).find((n) => n) ?? null,
        };
        // Varje sida är ett eget faktum, så att ett påstående kan hänvisa till den sida det bygger på.
        allHtml.forEach(({ page, html }, idx) => {
          const fact = idx === 0 ? book.add({ kind: "page", label: "Startsidan hämtades", value: finalUrl, source: finalUrl, detector: "page:home" }) : book.add({ kind: "page", label: "Sidan hämtades", value: page.finalUrl, source: page.finalUrl, detector: `page:${idx}` });
          texts.push({ id: fact.id, url: page.finalUrl, text: toText(html).slice(0, PAGE_TEXT_LIMIT) });
        });

        result.site = { status: "ok", message: null, domain, url: finalUrl, audit, tech: detections.filter((t) => !MARKETING.includes(t.category)) };
        result.marketingTech = detections.filter((t) => MARKETING.includes(t.category));
        result.social = socialLinks(home.html);
        result.inventory = inventory;
        result.creator = agency ? { ...agency, classification } : null;
        result.platformLinks = knownPlatformLinks(home.html, domain!);
        // Sådant en säljare kan ta fasta på, som belägg som modellen får hänvisa till.
        for (const issue of siteIssues(audit)) book.add({ kind: "audit", label: "Att notera om sajten", value: issue.label, source: finalUrl, detector: `issue:${issue.label.toLowerCase()}` });
        for (const link of result.platformLinks) book.add({ kind: "directory", label: `Webbplatsen länkar till ${link.name}`, value: link.kind, source: link.url, detector: `platform:${link.domain}` });
        if (i.companyId) await d.persistAudit(i.companyId, audit).catch(() => {});
      }
    }
  }

  const dnsDetections = await dnsPromise;
  if (dnsDetections.length) {
    book.addDetections(dnsDetections, "DNS", "dns");
    result.dns = dnsDetections;
  }

  // Inget org.nr på sidorna men ett bolagsnamn med adress: be om ett förslag och bekräfta det mot Bolagsverket.
  let foundByName: Extract<LookupResult, { ok: true }> | null = null;
  if (!registryEarly && !orgnr && !i.soleTrader && legalNames.length > 0 && d.lookupOrgnr) {
    // Byrån som byggt sajten och plattformar står ofta i sidfoten med ett AB efter sig, men är inte företaget.
    const credited = new Set([result.creator?.name, ...result.site.tech.map((t) => t.name)].filter((x): x is string => !!x).map((n) => agencyKey(n)));
    const own = legalNames.filter((n) => !credited.has(agencyKey(n.name)));
    const r = await d.lookupOrgnr(own).catch((): LookupResult => ({ ok: false, reason: "no-proposal" }));
    if (r.ok) {
      foundByName = r;
      orgnr = r.orgnr;
    }
  }

  // Org.nr hittat på webbplatsen (eller via bolagsnamnet): slå upp det nu.
  if (!registryEarly && orgnr) {
    result.registry = await gatherRegistry({ ...i, orgnr }, d, book);
    warnings.push(foundByName ? `Organisationsnumret ${foundByName.orgnr} hittades via webbsökning på bolagsnamnet "${foundByName.candidate.name}" och bekräftades mot Bolagsverket: namn och ${foundByName.candidate.city ? "ort" : "adress"} stämmer.` : "Organisationsnumret hittades på webbplatsen.");
  } else if (registryEarly) {
    result.registry = await registryEarly;
  } else {
    result.registry = { status: "no_orgnr", message: "Inget organisationsnummer hittades, så uppgifter från Bolagsverket saknas.", organisation: null, figures: null, figuresStatus: "not_fetched" };
  }

  Object.assign(result, { facts: book.all(), orgnr, websiteVerified, siteDomain: result.site.domain ?? domain, boundary });
  return result;
}
