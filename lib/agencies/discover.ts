import { pool } from "@/lib/db";
import { agencyKey } from "@/lib/profile/creator";
import { classifyDns, lookupDns, type DnsRecords } from "@/lib/profile/dns";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { CODE_SOURCE_NAME, isCodeSearchConfigured, searchCode } from "@/lib/scrapers/codesearch";
import { ipHistory, reverseLookup, type IpRecord } from "@/lib/scrapers/viewdns";
import { reverseIp } from "@/lib/scrapers/hackertarget";
import { isSearchConfigured, searchAgencyMentions, SEARCH_QUERY_SEK } from "./search";
import { customerServerHits, MIN_CUSTOMERS_PER_SERVER } from "./customer-servers";
import { customerPatternCandidates } from "./pattern";
import { CollectorError, type CollectContext } from "@/lib/scrapers/types";
import { findCustomersWithClaude } from "./agent";
import { fetchBacklinks, isOpenSeoConfigured } from "./openseo";
import { readAgencySite } from "./site-reader";
import { triageBacklinks, type BacklinkCandidate } from "./triage";
import { isAnthropicConfigured } from "@/lib/ai/model";
import { AGENCY_CREDIT_BUDGET } from "./openseo";
import { claudeAllowed, creditsLeftToday, searchAllowed, type Spend } from "./spend";
import { creatorMatchesAgency, isSameOrSubdomain, type Agency } from "./match";

// Var kandidaterna kommer ifrån. Allt här är förslag: ingenting läggs in förrän verifyCandidate (verify.ts) sett byrån
// i kandidatens egen sidfot. Källorna körs billigast först, och en som saknar nyckel eller felar ger bara färre förslag.

export type CandidateVia = "katalog" | "backlinks" | "site" | "publicwww" | "viewdns" | "search" | "pattern" | "claude" | "known";

export interface Candidate {
  domain: string;
  via: CandidateVia;
  /** Sidan som gav förslaget, när källan anger en. */
  sourceUrl: string | null;
  /** Claudes belägg: byråns sida som ska visa kunden. Kontrolleras av koden, aldrig tagen på ordet. */
  evidence?: { url: string; quote: string | null };
  /** Bakåtlänken som gav förslaget: sidan som länkar till byrån och länktexten. Verifieringen tittar på sidan. */
  hint?: { urlFrom: string; anchor: string | null };
  /** Mönstret i koden som kandidaten hittades på (hos de flesta av byråns kunder). Verifieringen kräver att sidan visar det. */
  pattern?: string;
  /** Servern kandidaten delar med byrån (ett reverse IP-uppslag) och hur många domäner som ligger där. Ger inget belägg ensamt. */
  server?: { ip: string; size: number };
}

/** Ett träffat domännamn från ViewDNS, med servern uppslaget gällde när det var ett reverse IP-uppslag. */
export interface ViewdnsHit {
  domain: string;
  server: { ip: string; size: number } | null;
}

/** ViewDNS-svar större än så här är delad drift (ett webbhotell), inte byråns egna kunder, och kastas. */
export const MAX_SHARED_RESULTS = 200;

export interface ViewdnsLookup {
  endpoint: "reverseip" | "reversens";
  target: string;
}

/**
 * Vilka ViewDNS-uppslag som blir precisa för byrån. Reverse NS när byrån har egna namnservrar (namnet ligger under
 * byråns domän), reverse IP när den har en enda egen IP-adress som inte tillhör ett känt webbhotell. Rent.
 */
export function chooseViewdnsLookups(rec: Pick<DnsRecords, "ns"> & { a: string[] }, agencyDomain: string): ViewdnsLookup[] {
  const out: ViewdnsLookup[] = [];
  const ownNs = rec.ns.map((h) => h.replace(/\.$/, "").toLowerCase()).find((h) => h === agencyDomain || h.endsWith(`.${agencyDomain}`));
  if (ownNs) out.push({ endpoint: "reversens", target: ownNs });
  if (rec.a.length === 1) {
    const hosts = classifyDns({ mx: [], ns: [], txt: [], hosting: { cname: [], a: rec.a, autodiscover: [] } });
    if (!hosts.some((d) => d.id.startsWith("host-"))) out.push({ endpoint: "reverseip", target: rec.a[0] });
  }
  return out;
}

/** Så många gamla IP-adresser slås upp per byrå. Varje uppslag är ett betalt anrop. */
export const MAX_HISTORY_IPS = 3;

/**
 * Vilka av byråns gamla IP-adresser som är värda ett uppslag: inte de den har nu (de är redan provade) och de senaste först.
 * Ett uppslag som ger över MAX_SHARED_RESULTS domäner är delad drift och kastas av anroparen. Ren.
 */
export function chooseHistoryIps(history: readonly IpRecord[], currentIps: readonly string[], limit = MAX_HISTORY_IPS): string[] {
  const current = new Set(currentIps);
  return [...new Set(history.map((h) => h.ip))].filter((ip) => !current.has(ip)).slice(0, limit);
}

/**
 * Skälet till att en källa hoppades över, på svenska och utan att låta som ett haveri. Felmeddelanden från biblioteken är på
 * engelska ("The operation was aborted due to timeout"), och en anteckning som den ser ut som att något gått sönder, fast
 * källan bara var långsam eller upptagen och försöks igen vid nästa körning. Okända fel visas som de är. Ren.
 */
export function readableReason(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/aborted due to timeout|TimeoutError|timed out|timeout/i.test(raw) && !/[åäö]/i.test(raw)) return "tog för lång tid och avbröts. Nästa körning provar igen.";
  if (/overloaded/i.test(raw)) return "tjänsten var överbelastad just nu. Nästa körning provar igen.";
  if (/rate.?limit|too many requests/i.test(raw) && !/[åäö]/i.test(raw)) return "tjänsten hann inte med just nu. Nästa körning provar igen.";
  if (/not scoped to a workspace/i.test(raw)) return "nyckeln saknar arbetsyta (ANTHROPIC_WORKSPACE_ID).";
  return raw;
}

/** Vad ett steg kostade. */
export interface Usage {
  credits?: number;
  costSek?: number;
}

export interface DiscoverDeps {
  /** Företag i vår katalog vars egen profil anger den här byrån. */
  catalog: (agency: Agency) => Promise<string[]>;
  /** `learned`: spår i koden som styrkt många kunder, att söka på i källkod förutom byråns domän. */
  publicwww: (agency: Agency, ctx: Pick<CollectContext, "signal" | "log">, learned?: readonly string[]) => Promise<{ domains: { domain: string; url: string | null }[]; truncated: boolean }>;
  viewdns: (agency: Agency, ctx: Pick<CollectContext, "signal" | "log">) => Promise<ViewdnsHit[]>;
  viewdnsConfigured: () => boolean;
  /** Bakåtlänkar till byråns domän (OpenSEO), rensade av triage. Dyrare än katalogen men det som hittar flest kunder. */
  backlinks: (agency: Agency, ctx: Pick<CollectContext, "signal" | "log">, opts: { budget: number }) => Promise<{ candidates: BacklinkCandidate[]; total: number; credits: number | null; dropped: number; creditsUsed?: number; more?: boolean }>;
  backlinksConfigured: () => boolean;
  /** Byråns egen webbplats: kundcase, kundlogotyper och sitemap, lästa av koden. */
  /** `linked`: byråns sida länkar till kunden. Utan den är domänen en gissning ur ett namn. */
  site: (agency: Agency) => Promise<{ domain: string; sourceUrl: string; linked?: boolean }[]>;
  /** Claude letar på byråns kund- och referenssidor och på webben. Får de redan funna domänerna så att den inte letar efter dem. */
  claude: (agency: Agency, known: string[], ctx: Pick<CollectContext, "signal" | "log">, report?: (u: Usage) => void) => Promise<{ domain: string; evidenceUrl: string; evidenceQuote: string | null }[]>;
  claudeConfigured: () => boolean;
  /** Sajter på servrarna där minst två av byråns bekräftade kunder ligger (reverse IP). Förslag som verifieringen prövar. */
  /** Claude läser källkoden hos några av byråns kunder och föreslår mönster de delar. Sajterna med mönstret blir kandidater. */
  patterns?: (agency: Agency, customers: readonly string[], ctx: Pick<CollectContext, "signal" | "log">) => Promise<{ domain: string; url: string | null; pattern: string }[]>;
  customerServers?: (agency: Agency, customers: readonly string[], ctx: Pick<CollectContext, "signal" | "log">) => Promise<{ domain: string; server: { ip: string; size: number } }[]>;
  /** Finns nyckeln till källkodssökningen? Utan den hoppar steget över utan att larma: det är ett tillägg. */
  codeSearchConfigured?: () => boolean;
  /** Webbsökning (Brave): sidor som nämner byrån i en kreditrad eller länkar till den. Valfri, betalas per sökning. */
  search?: (agency: Agency, ctx: Pick<CollectContext, "signal" | "log">) => Promise<{ hits: { domain: string; url: string }[]; queries: number; limited?: boolean }>;
  searchConfigured?: () => boolean;
}

export const defaultDiscoverDeps: DiscoverDeps = {
  async catalog(agency) {
    const { rows } = await pool.query(
      `select domain, profile->'creator' as creator from company_profiles
       where domain is not null and status = 'done'
         and (profile->'creator'->>'domain' = $1 or lower(profile->'creator'->>'name') like $2)`,
      [agency.domain, `${agencyKey(agency.name)}%`],
    );
    return rows
      .filter((r) => creatorMatchesAgency(r.creator as { name: string; domain: string | null } | null, agency))
      .map((r) => r.domain as string);
  },
  async publicwww(agency, ctx, learned = []) {
    const main = await searchCode(`"${agency.domain}"`, 1000, ctx);
    const domains = [...main.hits];
    let truncated = main.truncated;
    // Spår som redan styrkt många av byråns kunder: sök på dem i källkod. Det hittar kunder som aldrig länkat till byrån.
    // Ett fel här (kvoten tar slut) ger bara färre förslag.
    for (const token of learned) {
      try {
        const more = await searchCode(`"${token}"`, 1000, ctx);
        ctx.log(`Byrå ${agency.name}: spåret ${token} gav ${more.hits.length} sajter hos ${CODE_SOURCE_NAME}`);
        domains.push(...more.hits);
        truncated ||= more.truncated;
      } catch (e) {
        ctx.log(`Byrå ${agency.name}: sökningen på spåret ${token} hoppades över: ${e instanceof Error ? e.message : "okänt fel"}`);
      }
    }
    return { domains, truncated };
  },
  async viewdns(agency, ctx) {
    const rec = await lookupDns(agency.domain);
    const out: ViewdnsHit[] = [];
    const hits = (domains: string[], ip: string | null): ViewdnsHit[] => domains.map((domain) => ({ domain, server: ip ? { ip, size: domains.length } : null }));
    const hasKey = !!process.env.VIEWDNS_API_KEY;
    let failed: unknown = null;
    for (const lookup of chooseViewdnsLookups({ ns: rec.ns, a: rec.hosting?.a ?? [] }, agency.domain)) {
      try {
        let domains: string[];
        if (lookup.endpoint === "reverseip") {
          // ViewDNS när det går, annars HackerTarget (gratis, utan nyckel).
          domains = (await reverseIp(lookup.target, ctx)).domains;
        } else {
          // Reverse NS finns bara hos ViewDNS.
          if (!hasKey) continue;
          domains = (await reverseLookup(lookup.endpoint, lookup.target, 1, 1, ctx)).domains;
        }
        // Ett för stort svar är delad drift, inte byråns egna kunder.
        if (domains.length <= MAX_SHARED_RESULTS) out.push(...hits(domains, lookup.endpoint === "reverseip" ? lookup.target : null));
      } catch (e) {
        failed = e;
        ctx.log(`Byrå ${agency.name}: uppslaget ${lookup.endpoint} ${lookup.target} hoppades över: ${e instanceof Error ? e.message : "okänt fel"}`);
      }
    }
    // Byrån har ofta flyttat sin egen sajt men lämnat kunderna på den gamla servern. IP-historiken är en tilläggskälla
    // (bara ViewDNS har den): saknas den eller felar den ger det bara färre förslag.
    if (hasKey) {
      try {
        const now = rec.hosting?.a ?? [];
        for (const ip of chooseHistoryIps(await ipHistory(agency.domain, ctx), now)) {
          const domains = (await reverseIp(ip, ctx)).domains;
          ctx.log(`Byrå ${agency.name}: gamla adressen ${ip} gav ${domains.length} domäner`);
          if (domains.length <= MAX_SHARED_RESULTS) out.push(...hits(domains, ip));
        }
      } catch (e) {
        ctx.log(`Byrå ${agency.name}: IP-historiken hoppades över: ${e instanceof Error ? e.message : "okänt fel"}`);
      }
    }
    // Inget uppslag lyckades och inget gav något: låt steget räknas som överhoppat med skälet.
    if (out.length === 0 && failed) throw failed;
    return out;
  },
  // HackerTarget kräver ingen nyckel, så steget kan alltid köras: ViewDNS när nyckeln finns, annars den gratis reserven.
  viewdnsConfigured: () => true,
  async backlinks(agency, ctx, opts) {
    const r = await fetchBacklinks(agency.domain, { signal: ctx.signal, budget: opts.budget });
    const t = triageBacklinks(r.rows, agency);
    ctx.log(`Byrå ${agency.name}: OpenSEO gav ${r.rows.length} av ${r.total} länkande domäner på ${r.pages} sidor, ${t.candidates.length} kandidater efter rensning${r.creditsLeft === null ? "" : `, ${r.creditsLeft} krediter kvar`}`);
    return { candidates: t.candidates, total: r.total, credits: r.creditsLeft, dropped: t.dropped.length, creditsUsed: r.creditsUsed, more: r.more };
  },
  backlinksConfigured: () => isOpenSeoConfigured(),
  async site(agency) {
    return (await readAgencySite(agency)).findings.map((f) => ({ domain: f.domain, sourceUrl: f.sourceUrl, linked: f.how === "case-link" }));
  },
  async claude(agency, known, ctx, report) {
    const r = await findCustomersWithClaude({ agency, known, signal: ctx.signal });
    report?.({ costSek: r.costSek ?? 0 });
    ctx.log(`Byrå ${agency.name}: Claude gav ${r.candidates.length} förslag (${r.model}, ${r.inputTokens} in, ${r.outputTokens} ut, ${r.webSearches} sökningar, cirka ${r.costSek === null ? "okänd kostnad" : `${r.costSek.toFixed(2)} kr`})`);
    return r.candidates;
  },
  claudeConfigured: isAnthropicConfigured,
  customerServers: (agency, customers, ctx) => customerServerHits(agency.domain, customers, ctx),
  patterns: (agency, customers, ctx) => customerPatternCandidates(agency, customers, ctx),
  codeSearchConfigured: () => isCodeSearchConfigured(),
  search: async (agency, ctx) => searchAgencyMentions(agency, ctx),
  searchConfigured: () => isSearchConfigured(),
};

export interface Discovery {
  candidates: Candidate[];
  /** Fler kandidater fanns än taket tillät. */
  truncated: boolean;
  /** Källor som hoppades över och varför, på svenska, för körpanelen. */
  notes: string[];
  /** Vad upptäckten kostade. */
  usage: { credits: number; costSek: number };
}

/** Stegen i ordning. Varje steg körs för sig, så att en körning kan stanna mellan två av dem och fortsätta senare. */
export const STEPS = ["catalog", "backlinks", "site", "publicwww", "viewdns", "patterns", "search", "claude"] as const;
/** Claude letar bara när koden hittat så här få kandidater: för en byrå med många bakåtlänkar tillför den sällan något. */
export const CLAUDE_BELOW = 40;

/** Upptäckten som ett värde som går att spara i körningens markör. */
export interface DiscoveryState {
  step: number;
  found: Candidate[];
  notes: string[];
  /** Antal externa källor som fungerade. */
  externalOk: number;
  truncated: boolean;
  usage: { credits: number; costSek: number };
}

export const newDiscovery = (): DiscoveryState => ({ step: 0, found: [], notes: [], externalOk: 0, truncated: false, usage: { credits: 0, costSek: 0 } });
export const discoveryDone = (s: DiscoveryState): boolean => s.step >= STEPS.length;

export interface DiscoverOpts {
  max: number;
  useViewdns: boolean;
  useClaude?: boolean;
  rejected: ReadonlySet<string>;
  /** Dygnets förbrukning hittills, för taken. */
  spend?: Spend;
  claudeBelow?: number;
  /** Spår i koden som styrkt många av byråns kunder, att söka på i källkod hos SearchWebCode. */
  learned?: readonly string[];
  /** Domänerna på byråns bekräftade kunder, för uppslaget av deras servrar. */
  customers?: readonly string[];
}

/**
 * Kör nästa steg och ger det nya läget. Alla utom katalogen är tillägg som kan saknas: kvoten hos källkodssökningen (SearchWebCode) tar slut,
 * en nyckel kan fattas, dygnets tak kan vara nått. Ett steg som hoppas över antecknas och körningen fortsätter.
 */
export async function runDiscoveryStep(
  state: DiscoveryState,
  agency: Agency,
  opts: DiscoverOpts,
  ctx: Pick<CollectContext, "signal" | "log">,
  deps: DiscoverDeps = defaultDiscoverDeps,
): Promise<DiscoveryState> {
  const step = STEPS[state.step];
  const next: DiscoveryState = { ...state, step: state.step + 1, found: [...state.found], notes: [...state.notes], usage: { ...state.usage } };
  const seen = new Set(next.found.map((c) => c.domain));
  const spend = opts.spend ?? { credits: 0, costSek: 0 };
  const add = (raw: string | null | undefined, via: CandidateVia, sourceUrl: string | null = null, evidence?: Candidate["evidence"], hint?: Candidate["hint"], server?: Candidate["server"], pattern?: string) => {
    const domain = normalizeDomain(raw);
    if (!domain || seen.has(domain) || isSameOrSubdomain(domain, agency.domain) || opts.rejected.has(domain)) return;
    seen.add(domain);
    next.found.push({ domain, via, sourceUrl, ...(evidence ? { evidence } : {}), ...(hint ? { hint } : {}), ...(server ? { server } : {}), ...(pattern ? { pattern } : {}) });
  };
  const skip = (source: string, e: unknown) => {
    const why = readableReason(e);
    next.notes.push(`${source} hoppades över: ${why}`);
    ctx.log(`Byrå ${agency.name}: ${source} hoppades över (${why})`);
  };
  const report = (u: Usage) => {
    next.usage.credits += u.credits ?? 0;
    next.usage.costSek += u.costSek ?? 0;
  };

  switch (step) {
    case "catalog":
      for (const d of await deps.catalog(agency).catch(() => [] as string[])) add(d, "katalog");
      ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater ur vår katalog`);
      break;

    case "backlinks": {
      // Bakåtlänkar först bland de externa: det är den källa som hittar flest, och den är billig per kund.
      if (!deps.backlinksConfigured()) {
        next.notes.push("OpenSEO hoppades över: ingen nyckel är konfigurerad.");
        break;
      }
      const budget = Math.min(AGENCY_CREDIT_BUDGET, creditsLeftToday(spend));
      try {
        const bl = await deps.backlinks(agency, ctx, { budget });
        for (const c of bl.candidates) add(c.domain, "backlinks", c.urlFrom, undefined, { urlFrom: c.urlFrom, anchor: c.anchor });
        report({ credits: bl.creditsUsed ?? 0 });
        if (bl.more) next.notes.push(`OpenSEO: fler länkande domäner finns (${bl.total}) än budgeten på ${budget} krediter räckte till.`);
        next.externalOk++;
        ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater efter OpenSEO`);
      } catch (e) {
        skip("OpenSEO", e);
      }
      break;
    }

    case "site":
      try {
        const found = await deps.site(agency);
        // En kund som byråns egen sida länkar till har den sidan som belägg (portfolio). En gissad domän har inget.
        for (const f of found) add(f.domain, "site", f.sourceUrl, f.linked ? { url: f.sourceUrl, quote: null } : undefined);
        // En webbplats som inte gav något förslag räknas inte som en fungerande källa.
        if (found.length > 0) next.externalOk++;
        else next.notes.push("Byråns webbplats gav inga kundförslag.");
        ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater efter byråns egen webbplats`);
      } catch (e) {
        skip("Byråns webbplats", e);
      }
      break;

    case "publicwww":
      if (deps.codeSearchConfigured && !deps.codeSearchConfigured()) break;
      try {
        const pw = await deps.publicwww(agency, ctx, opts.learned ?? []);
        for (const r of pw.domains) add(r.domain, "publicwww", r.url);
        if (pw.truncated) next.truncated = true;
        next.externalOk++;
        ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater efter ${CODE_SOURCE_NAME}`);
      } catch (e) {
        skip(CODE_SOURCE_NAME, e);
      }
      break;

    case "viewdns":
      if (opts.useViewdns && deps.viewdnsConfigured()) {
        try {
          for (const d of await deps.viewdns(agency, ctx)) add(d.domain, "viewdns", null, undefined, undefined, d.server ?? undefined);
          next.externalOk++;
          ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater efter ViewDNS`);
        } catch (e) {
          skip("ViewDNS", e);
        }
        // Kundernas servrar: har minst två kunder samma server slås det upp vilka andra sajter som ligger där.
        if (deps.customerServers && (opts.customers?.length ?? 0) >= MIN_CUSTOMERS_PER_SERVER) {
          try {
            const hits = await deps.customerServers(agency, opts.customers!, ctx);
            for (const h of hits) add(h.domain, "viewdns", null, undefined, undefined, h.server);
            if (hits.length > 0) next.externalOk++;
            ctx.log(`Byrå ${agency.name}: ${hits.length} sajter på kundernas servrar, ${next.found.length} kandidater totalt`);
          } catch (e) {
            skip("Kundernas servrar", e);
          }
        }
      }
      break;

    case "patterns": {
      // Claude läser källkoden hos några av byråns bekräftade kunder och föreslår mönster de delar. Kräver Claude, en
      // källkodssökning och minst tre kunder. Varje träff prövas mot sin egen sida i verifieringen.
      if (!opts.useClaude || !deps.patterns || (opts.customers?.length ?? 0) < 3) break;
      if (!claudeAllowed(spend)) {
        next.notes.push("Mönstersökningen hoppades över: dagens tak för Claude är nått.");
        break;
      }
      try {
        const found = await deps.patterns(agency, opts.customers!, ctx);
        for (const c of found) add(c.domain, "pattern", c.url, undefined, undefined, undefined, c.pattern);
        report({ costSek: 0.2 });
        if (found.length > 0) next.externalOk++;
        ctx.log(`Byrå ${agency.name}: ${found.length} sajter med byråns mönster, ${next.found.length} kandidater totalt`);
      } catch (e) {
        skip("Mönstersökningen", e);
      }
      break;
    }

    case "search": {
      if (!deps.search || !deps.searchConfigured?.()) break; // valfri källa: utan nyckel är den inte med
      if (!searchAllowed(spend)) {
        next.notes.push("Webbsökningen hoppades över: dagens tak är nått.");
        break;
      }
      try {
        const r = await deps.search(agency, ctx);
        for (const h of r.hits) add(h.domain, "search", h.url, undefined, { urlFrom: h.url, anchor: null });
        report({ costSek: r.queries * SEARCH_QUERY_SEK });
        if (r.limited) next.notes.push("Webbsökningen nådde månadens tak på antal anrop och stannade. Den fortsätter när en ny månad börjar.");
        if (r.hits.length > 0) next.externalOk++;
        ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater efter webbsökningen (${r.queries} sökningar)`);
      } catch (e) {
        skip("Webbsökningen", e);
      }
      break;
    }

    case "claude": {
      if (!opts.useClaude) break;
      if (!deps.claudeConfigured()) {
        next.notes.push("Claude hoppades över: ingen API-nyckel är konfigurerad.");
        break;
      }
      if (next.found.length >= (opts.claudeBelow ?? CLAUDE_BELOW)) {
        ctx.log(`Byrå ${agency.name}: Claude behövs inte, ${next.found.length} kandidater finns redan`);
        break;
      }
      if (!claudeAllowed(spend)) {
        next.notes.push("Claude hoppades över: dagens tak för Claude är nått.");
        break;
      }
      try {
        const known = [...seen];
        for (const c of await deps.claude(agency, known, ctx, report)) add(c.domain, "claude", c.evidenceUrl, { url: c.evidenceUrl, quote: c.evidenceQuote });
        next.externalOk++;
        ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater efter Claude`);
      } catch (e) {
        skip("Claude", e);
      }
      break;
    }
  }
  return next;
}

/**
 * Slutlistan: katalogen först, sedan bakåtlänkar, byråns egen webbplats, Claude, källkodssökningen och ViewDNS, högst `max`.
 * Kastar när ingen extern källa fungerade och ingenting hittades alls.
 */
export function finishDiscovery(state: DiscoveryState, max: number): Discovery {
  if (state.externalOk === 0 && state.found.length === 0) {
    throw new CollectorError(`Ingen källa gick att använda för att hitta kunder. ${state.notes.join(" ")}`.trim());
  }
  const order: CandidateVia[] = ["katalog", "backlinks", "site", "claude", "search", "pattern", "publicwww", "viewdns"];
  const all = order.flatMap((via) => state.found.filter((c) => c.via === via));
  return { candidates: all.slice(0, max), truncated: state.truncated || all.length > max, notes: state.notes, usage: state.usage };
}

/** Hela upptäckten i ett svep, för tester och för körningar som inte behöver stanna mellan stegen. */
export async function discoverCandidates(agency: Agency, opts: DiscoverOpts, ctx: Pick<CollectContext, "signal" | "log">, deps: DiscoverDeps = defaultDiscoverDeps): Promise<Discovery> {
  let state = newDiscovery();
  while (!discoveryDone(state)) state = await runDiscoveryStep(state, agency, opts, ctx, deps);
  return finishDiscovery(state, opts.max);
}
