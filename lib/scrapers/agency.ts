import { mapWithConcurrency } from "@/lib/concurrency";
import { discoveryDone, finishDiscovery, newDiscovery, runDiscoveryStep, defaultDiscoverDeps, type Candidate, type DiscoverDeps, type DiscoveryState } from "@/lib/agencies/discover";
import type { Agency } from "@/lib/agencies/match";
import { afterRecheck, recentlyChecked } from "@/lib/agencies/recheck";
import { spendLast24h, type Spend } from "@/lib/agencies/spend";
import { existingCustomerDomains, loadChecked, markCustomerLost, recordChecked, rejectedDomains, type CheckedRow } from "@/lib/agencies/store";
import { verifyCandidate, type BacklinkHint, type PortfolioProof, type Verdict } from "@/lib/agencies/verify";
import { PageBudget, safeFetch } from "@/lib/profile/safe-fetch";
import { agencyConfigSchema, type AgencyConfig } from "@/lib/sources/schema";
import { normalizeDomain, websiteUrl } from "./domain";
import { CollectorError, type CollectBatch, type CollectContext, type Collector, type Json } from "./types";

// Byråns kunder, i steg som överlever varandra via markören. Körningen kan stanna mellan två steg, så ingen omgång
// behöver rymma allt:
//
//   discover   ett källsteg i taget (katalog, bakåtlänkar, byråns webbplats, PublicWWW, ViewDNS, Claude)
//   verify     kandidaterna kontrolleras i omgångar mot kundens EGEN sida. Bara de som visar byrån blir poster, med
//              beviset bifogat. Redan kontrollerade domäner hoppas över, så att en stor byrå fylls på över flera körningar.
//
// Befintliga kunder kontrolleras om varje körning: visar en kund inte byrån två körningar i rad tas den bort och
// noteras som tappad, eller som byte när sidan nu visar en annan byrå. En sida som inte går att läsa ändrar ingenting.

/** Så många nya kandidater kontrolleras per körning. Resten väntar till nästa. */
export const FRESH_BATCH = 600;
const VERIFY_CHUNK = 40;
const VERIFY_CONCURRENCY = 8;
/** Ett slumpat uppehåll före varje kontroll, så att tusen sajter inte får anrop i samma sekund. */
const JITTER_MS = 120;

interface Stats {
  checked: number;
  accepted: number;
  lost: number;
  rejected: Record<string, number>;
}

type Cursor =
  | { stage: "discover"; state: DiscoveryState }
  | { stage: "verify"; queue: Candidate[]; index: number; total: number; stats: Stats };

export interface AgencyDeps {
  discover: DiscoverDeps;
  rejected: (supplierId: string) => Promise<ReadonlySet<string>>;
  verify: (domain: string, agency: Agency, proof?: PortfolioProof | null, hint?: BacklinkHint | null) => Promise<Verdict>;
  /** Hämtar en av byråns egna sidor (Claudes belägg) som text, eller null. Gränsen är byråns domän. */
  fetchProof: (url: string, agency: Agency) => Promise<string | null>;
  /** Domänerna på byråns nuvarande kunder. */
  existing: (supplierId: string) => Promise<string[]>;
  checked: (supplierId: string) => Promise<Map<string, CheckedRow>>;
  record: (supplierId: string, rows: { domain: string; verdict: string; misses: number }[]) => Promise<void>;
  markLost: (supplierId: string, domain: string, kind: "lost" | "switched", toName: string | null) => Promise<boolean>;
  spend: () => Promise<Spend>;
  now: () => number;
  pause: (ms: number) => Promise<void>;
}

const defaultDeps = (): AgencyDeps => ({
  discover: defaultDiscoverDeps,
  rejected: rejectedDomains,
  verify: (domain, agency, proof, hint) => verifyCandidate(domain, agency, undefined, proof, hint),
  async fetchProof(url, agency) {
    const page = await safeFetch(url, agency.domain, new PageBudget(1, 0));
    return page.html;
  },
  existing: existingCustomerDomains,
  checked: loadChecked,
  record: recordChecked,
  markLost: markCustomerLost,
  spend: spendLast24h,
  now: Date.now,
  pause: (ms) => new Promise((r) => setTimeout(r, ms)),
});

const REASON_SV: Record<string, string> = { "no-credit": "utan kredit", "other-agency": "annan byrå", unreachable: "svarade inte", blocked: "blockerade", "own-domain": "byråns egen domän" };

/** "Kontrollerade 185: 74 godkända, 52 utan kredit, 11 svarade inte". Ren. */
export function summary(s: Stats): string {
  const parts = Object.entries(s.rejected).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n} ${REASON_SV[r] ?? r}`);
  return `Kontrollerade ${s.checked}: ${s.accepted} godkända${parts.length ? `, ${parts.join(", ")}` : ""}${s.lost > 0 ? `, ${s.lost} kunder har slutat visa byrån` : ""}.`;
}

function readCursor(cursor: Json | null): Cursor | null {
  const c = cursor as Record<string, unknown> | null;
  if (!c) return null;
  if (c.stage === "discover" && c.state) return c as unknown as Cursor;
  if (c.stage === "verify" && Array.isArray(c.queue)) return c as unknown as Cursor;
  // Markören från före stegen: en färdig lista och ett index.
  if (Array.isArray(c.candidates) && typeof c.index === "number") {
    const queue = c.candidates as Candidate[];
    return { stage: "verify", queue, index: c.index, total: queue.length, stats: { checked: 0, accepted: 0, lost: 0, rejected: {} } };
  }
  return null;
}

const asJson = (c: Cursor): Json => c as unknown as Json;

export function createAgencyCollector(deps: AgencyDeps = defaultDeps()): Collector<AgencyConfig> {
  return {
    method: "agency",

    parseConfig(raw) {
      const parsed = agencyConfigSchema.safeParse(raw);
      const domain = parsed.success ? normalizeDomain(parsed.data.domain) : null;
      if (!parsed.success || !domain) throw new CollectorError("Byråns inställningar är ofullständiga. Redigera källan.");
      return { ...parsed.data, domain };
    },

    async *collect(config: AgencyConfig, ctx: CollectContext) {
      const agency: Agency = { name: config.agencyName, domain: config.domain };
      const supplierId = ctx.profile.id;
      const cursor = readCursor(ctx.cursor) ?? { stage: "discover" as const, state: newDiscovery() };
      let verify: Extract<Cursor, { stage: "verify" }>;

      // ------------------------------------------------------------------ upptäckt, ett steg per omgång av markören
      if (cursor.stage === "discover") {
        const rejected = await deps.rejected(supplierId);
        const spend = await deps.spend();
        let state = cursor.state;
        while (!discoveryDone(state)) {
          const before = state.usage;
          state = await runDiscoveryStep(state, agency, { max: config.maxCandidates, useViewdns: config.useViewdns, useClaude: config.useClaude, rejected, spend }, ctx, deps.discover);
          // Markören skrivs efter varje steg, så att en omgång som tar slut fortsätter vid nästa steg och inte från början.
          if (!discoveryDone(state)) yield { items: [], cursor: asJson({ stage: "discover", state }), usage: { credits: state.usage.credits - before.credits, costSek: state.usage.costSek - before.costSek } };
        }

        // Allt upptäckt: befintliga kunder kontrolleras om, och nya kandidater (som inte kontrollerats nyligen) i en omgång.
        const found = finishDiscovery(state, config.maxCandidates);
        const known = new Set(await deps.existing(supplierId));
        const checkedBefore = await deps.checked(supplierId);
        const now = deps.now();
        const fresh = found.candidates.filter((c) => !known.has(c.domain) && !recentlyChecked(checkedBefore.get(c.domain), now));
        const recent = found.candidates.filter((c) => !known.has(c.domain)).length - fresh.length;
        const batch = fresh.slice(0, FRESH_BATCH);
        const recheck: Candidate[] = [...known].map((domain) => ({ domain, via: "known", sourceUrl: null }));
        const queue = [...recheck, ...batch];
        const deferred = fresh.length - batch.length;
        ctx.log(`Byrå ${agency.name}: ${queue.length} att kontrollera (${recheck.length} befintliga kunder, ${batch.length} nya, ${recent} kontrollerade nyligen, ${deferred} väntar)`);
        const text = [
          ...found.notes,
          `Kandidater: ${found.candidates.length}. Nya att kontrollera nu: ${batch.length}${recent ? `, redan kontrollerade nyligen: ${recent}` : ""}${deferred ? `, ${deferred} väntar till nästa körning` : ""}${recheck.length ? `. Befintliga kunder som kontrolleras om: ${recheck.length}` : ""}.`,
        ].join(" ");
        verify = { stage: "verify", queue, index: 0, total: queue.length, stats: { checked: 0, accepted: 0, lost: 0, rejected: {} } };
        yield { items: [], cursor: queue.length > 0 ? asJson(verify) : null, truncated: found.truncated || deferred > 0, note: text };
        if (queue.length === 0) return;
      } else {
        verify = cursor;
      }

      // --------------------------------------------------------------------------------------------------- kontroll
      const checked = await deps.checked(supplierId);

      // Byråns sidor som Claude pekat på hämtas av oss, en gång per adress. Claudes referat räknas aldrig som belägg.
      const proofPages = new Map<string, Promise<string | null>>();
      const proofFor = async (c: Candidate): Promise<PortfolioProof | null> => {
        if (!c.evidence) return null;
        if (!proofPages.has(c.evidence.url)) proofPages.set(c.evidence.url, deps.fetchProof(c.evidence.url, agency).catch(() => null));
        return { url: c.evidence.url, html: await proofPages.get(c.evidence.url)! };
      };

      while (verify.index < verify.queue.length) {
        const chunk = verify.queue.slice(verify.index, verify.index + VERIFY_CHUNK);
        const verdicts = await mapWithConcurrency(chunk, VERIFY_CONCURRENCY, async (c) => {
          await deps.pause(Math.floor(Math.random() * JITTER_MS));
          const verdict = await deps.verify(c.domain, agency, await proofFor(c), c.hint ?? null).catch((): Verdict => ({ accepted: false, reason: "unreachable" }));
          return { c, verdict };
        });

        const items: CollectBatch["items"] = [];
        const rows: { domain: string; verdict: string; misses: number }[] = [];
        const stats: Stats = { checked: chunk.length, accepted: 0, lost: 0, rejected: {} };
        for (const { c, verdict } of verdicts) {
          const known = c.via === "known";
          const prevMisses = checked.get(c.domain)?.misses ?? 0;
          if (verdict.accepted) {
            stats.accepted++;
            rows.push({ domain: c.domain, verdict: "accepted", misses: 0 });
            // En befintlig kund behåller sin post och sitt ursprungliga belägg.
            if (known) continue;
            items.push({
              dedupeKey: c.domain,
              domain: c.domain,
              website: websiteUrl(c.domain),
              sourceUrl: verdict.evidenceUrl,
              raw: { confidence: verdict.confidence, evidence: verdict.evidence, via: c.via, agency: agency.domain, ...(c.evidence?.quote ? { quote: c.evidence.quote } : {}), ...(c.hint ? { anchor: c.hint.anchor, urlFrom: c.hint.urlFrom } : {}) },
              prefilled: false,
            });
            continue;
          }
          stats.rejected[verdict.reason] = (stats.rejected[verdict.reason] ?? 0) + 1;
          if (known) {
            const after = afterRecheck(verdict.reason, prevMisses);
            if (after.lost && (await deps.markLost(supplierId, c.domain, verdict.reason === "other-agency" ? "switched" : "lost", verdict.reason === "other-agency" ? verdict.to : null))) stats.lost++;
            rows.push({ domain: c.domain, verdict: verdict.reason, misses: after.misses });
          } else {
            rows.push({ domain: c.domain, verdict: verdict.reason, misses: 0 });
          }
        }
        await deps.record(supplierId, rows);

        verify = { ...verify, index: verify.index + chunk.length, stats: mergeStats(verify.stats, stats) };
        ctx.log(`Byrå ${agency.name}: kontrollerat ${verify.index} av ${verify.queue.length}, ${stats.accepted} godkända i omgången`);
        const done = verify.index >= verify.queue.length;
        yield { items, cursor: done ? null : asJson(verify), stats: { checked: stats.checked, accepted: stats.accepted, rejected: stats.rejected }, ...(done ? { note: summary(verify.stats) } : {}) };
        if (done) return;
      }
    },
  };
}

function mergeStats(a: Stats, b: Stats): Stats {
  const rejected = { ...a.rejected };
  for (const [k, n] of Object.entries(b.rejected)) rejected[k] = (rejected[k] ?? 0) + n;
  return { checked: a.checked + b.checked, accepted: a.accepted + b.accepted, lost: a.lost + b.lost, rejected };
}
