import { pool } from "@/lib/db";
import { agencyKey } from "@/lib/profile/creator";
import { classifyDns, lookupDns, type DnsRecords } from "@/lib/profile/dns";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { searchPublicwww } from "@/lib/scrapers/publicwww";
import { ipHistory, reverseLookup, type IpRecord } from "@/lib/scrapers/viewdns";
import { CollectorError, type CollectContext } from "@/lib/scrapers/types";
import { findCustomersWithClaude } from "./agent";
import { fetchBacklinks, isOpenSeoConfigured } from "./openseo";
import { readAgencySite } from "./site-reader";
import { triageBacklinks, type BacklinkCandidate } from "./triage";
import { isAnthropicConfigured } from "@/lib/ai/model";
import { AGENCY_CREDIT_BUDGET } from "./openseo";
import { claudeAllowed, creditsLeftToday, type Spend } from "./spend";
import { creatorMatchesAgency, isSameOrSubdomain, type Agency } from "./match";

// Var kandidaterna kommer ifrån. Allt här är förslag: ingenting läggs in förrän verifyCandidate (verify.ts) sett byrån
// i kandidatens egen sidfot. Källorna körs billigast först, och en som saknar nyckel eller felar ger bara färre förslag.

export type CandidateVia = "katalog" | "backlinks" | "site" | "publicwww" | "viewdns" | "claude" | "known";

export interface Candidate {
  domain: string;
  via: CandidateVia;
  /** Sidan som gav förslaget, när källan anger en. */
  sourceUrl: string | null;
  /** Claudes belägg: byråns sida som ska visa kunden. Kontrolleras av koden, aldrig tagen på ordet. */
  evidence?: { url: string; quote: string | null };
  /** Bakåtlänken som gav förslaget: sidan som länkar till byrån och länktexten. Verifieringen tittar på sidan. */
  hint?: { urlFrom: string; anchor: string | null };
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

/** Vad ett steg kostade. */
export interface Usage {
  credits?: number;
  costSek?: number;
}

export interface DiscoverDeps {
  /** Företag i vår katalog vars egen profil anger den här byrån. */
  catalog: (agency: Agency) => Promise<string[]>;
  publicwww: (agency: Agency, ctx: Pick<CollectContext, "signal" | "log">) => Promise<{ domains: { domain: string; url: string | null }[]; truncated: boolean }>;
  viewdns: (agency: Agency, ctx: Pick<CollectContext, "signal" | "log">) => Promise<ViewdnsHit[]>;
  viewdnsConfigured: () => boolean;
  /** Bakåtlänkar till byråns domän (OpenSEO), rensade av triage. Dyrare än katalogen men det som hittar flest kunder. */
  backlinks: (agency: Agency, ctx: Pick<CollectContext, "signal" | "log">, opts: { budget: number }) => Promise<{ candidates: BacklinkCandidate[]; total: number; credits: number | null; dropped: number; creditsUsed?: number; more?: boolean }>;
  backlinksConfigured: () => boolean;
  /** Byråns egen webbplats: kundcase, kundlogotyper och sitemap, lästa av koden. */
  site: (agency: Agency) => Promise<{ domain: string; sourceUrl: string }[]>;
  /** Claude letar på byråns kund- och referenssidor och på webben. Får de redan funna domänerna så att den inte letar efter dem. */
  claude: (agency: Agency, known: string[], ctx: Pick<CollectContext, "signal" | "log">, report?: (u: Usage) => void) => Promise<{ domain: string; evidenceUrl: string; evidenceQuote: string | null }[]>;
  claudeConfigured: () => boolean;
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
  async publicwww(agency, ctx) {
    const body = await searchPublicwww(`"${agency.domain}"`, 1000, ctx);
    return { domains: (body.results ?? []).map((r) => ({ domain: r.domain ?? r.url ?? "", url: r.url ?? null })), truncated: body.truncated === true };
  },
  async viewdns(agency, ctx) {
    const rec = await lookupDns(agency.domain);
    const out: ViewdnsHit[] = [];
    const hits = (domains: string[], ip: string | null): ViewdnsHit[] => domains.map((domain) => ({ domain, server: ip ? { ip, size: domains.length } : null }));
    for (const lookup of chooseViewdnsLookups({ ns: rec.ns, a: rec.hosting?.a ?? [] }, agency.domain)) {
      const page = await reverseLookup(lookup.endpoint, lookup.target, 1, 1, ctx);
      // Ett för stort svar är delad drift, inte byråns egna kunder.
      if (page.domains.length <= MAX_SHARED_RESULTS) out.push(...hits(page.domains, lookup.endpoint === "reverseip" ? lookup.target : null));
    }
    // Byrån har ofta flyttat sin egen sajt men lämnat kunderna på den gamla servern. IP-historiken är en tilläggskälla:
    // saknas den (ViewDNS Pro) eller felar den ger det bara färre förslag.
    try {
      const now = rec.hosting?.a ?? [];
      for (const ip of chooseHistoryIps(await ipHistory(agency.domain, ctx), now)) {
        const page = await reverseLookup("reverseip", ip, 1, 1, ctx);
        ctx.log(`Byrå ${agency.name}: gamla adressen ${ip} gav ${page.domains.length} domäner`);
        if (page.domains.length <= MAX_SHARED_RESULTS) out.push(...hits(page.domains, ip));
      }
    } catch (e) {
      ctx.log(`Byrå ${agency.name}: IP-historiken hoppades över: ${e instanceof Error ? e.message : "okänt fel"}`);
    }
    return out;
  },
  viewdnsConfigured: () => !!process.env.VIEWDNS_API_KEY,
  async backlinks(agency, ctx, opts) {
    const r = await fetchBacklinks(agency.domain, { signal: ctx.signal, budget: opts.budget });
    const t = triageBacklinks(r.rows, agency);
    ctx.log(`Byrå ${agency.name}: OpenSEO gav ${r.rows.length} av ${r.total} länkande domäner på ${r.pages} sidor, ${t.candidates.length} kandidater efter rensning${r.creditsLeft === null ? "" : `, ${r.creditsLeft} krediter kvar`}`);
    return { candidates: t.candidates, total: r.total, credits: r.creditsLeft, dropped: t.dropped.length, creditsUsed: r.creditsUsed, more: r.more };
  },
  backlinksConfigured: () => isOpenSeoConfigured(),
  async site(agency) {
    return (await readAgencySite(agency)).findings.map((f) => ({ domain: f.domain, sourceUrl: f.sourceUrl }));
  },
  async claude(agency, known, ctx, report) {
    const r = await findCustomersWithClaude({ agency, known, signal: ctx.signal });
    report?.({ costSek: r.costSek ?? 0 });
    ctx.log(`Byrå ${agency.name}: Claude gav ${r.candidates.length} förslag (${r.model}, ${r.inputTokens} in, ${r.outputTokens} ut, ${r.webSearches} sökningar, cirka ${r.costSek === null ? "okänd kostnad" : `${r.costSek.toFixed(2)} kr`})`);
    return r.candidates;
  },
  claudeConfigured: isAnthropicConfigured,
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
export const STEPS = ["catalog", "backlinks", "site", "publicwww", "viewdns", "claude"] as const;
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
}

/**
 * Kör nästa steg och ger det nya läget. Alla utom katalogen är tillägg som kan saknas: kvoten hos PublicWWW tar slut,
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
  const add = (raw: string | null | undefined, via: CandidateVia, sourceUrl: string | null = null, evidence?: Candidate["evidence"], hint?: Candidate["hint"], server?: Candidate["server"]) => {
    const domain = normalizeDomain(raw);
    if (!domain || seen.has(domain) || isSameOrSubdomain(domain, agency.domain) || opts.rejected.has(domain)) return;
    seen.add(domain);
    next.found.push({ domain, via, sourceUrl, ...(evidence ? { evidence } : {}), ...(hint ? { hint } : {}), ...(server ? { server } : {}) });
  };
  const skip = (source: string, e: unknown) => {
    const why = e instanceof Error ? e.message : String(e);
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
        for (const f of found) add(f.domain, "site", f.sourceUrl);
        // En webbplats som inte gav något förslag räknas inte som en fungerande källa.
        if (found.length > 0) next.externalOk++;
        else next.notes.push("Byråns webbplats gav inga kundförslag.");
        ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater efter byråns egen webbplats`);
      } catch (e) {
        skip("Byråns webbplats", e);
      }
      break;

    case "publicwww":
      try {
        const pw = await deps.publicwww(agency, ctx);
        for (const r of pw.domains) add(r.domain, "publicwww", r.url);
        if (pw.truncated) next.truncated = true;
        next.externalOk++;
        ctx.log(`Byrå ${agency.name}: ${next.found.length} kandidater efter PublicWWW`);
      } catch (e) {
        skip("PublicWWW", e);
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
      }
      break;

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
 * Slutlistan: katalogen först, sedan bakåtlänkar, byråns egen webbplats, Claude, PublicWWW och ViewDNS, högst `max`.
 * Kastar när ingen extern källa fungerade och ingenting hittades alls.
 */
export function finishDiscovery(state: DiscoveryState, max: number): Discovery {
  if (state.externalOk === 0 && state.found.length === 0) {
    throw new CollectorError(`Ingen källa gick att använda för att hitta kunder. ${state.notes.join(" ")}`.trim());
  }
  const order: CandidateVia[] = ["katalog", "backlinks", "site", "claude", "publicwww", "viewdns"];
  const all = order.flatMap((via) => state.found.filter((c) => c.via === via));
  return { candidates: all.slice(0, max), truncated: state.truncated || all.length > max, notes: state.notes, usage: state.usage };
}

/** Hela upptäckten i ett svep, för tester och för körningar som inte behöver stanna mellan stegen. */
export async function discoverCandidates(agency: Agency, opts: DiscoverOpts, ctx: Pick<CollectContext, "signal" | "log">, deps: DiscoverDeps = defaultDiscoverDeps): Promise<Discovery> {
  let state = newDiscovery();
  while (!discoveryDone(state)) state = await runDiscoveryStep(state, agency, opts, ctx, deps);
  return finishDiscovery(state, opts.max);
}
