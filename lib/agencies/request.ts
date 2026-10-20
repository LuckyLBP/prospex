import { pool } from "@/lib/db";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { triggerRun } from "@/lib/runs/start";
import { RunStartError } from "@/lib/runs/errors";
import { autoEnabled, MAX_ACTIVE_AGENCY_RUNS, MAX_NEW_AGENCIES_PER_DAY } from "./auto";
import { overDailyCap, spendLast24h, type Spend } from "./spend";
import { ensureAgencySupplier, getSourceByDomain, type SourceState } from "./store";

// "Hitta deras kunder": ett bolag som spanat på en plattform eller byrå (offerta.se, leads.nu) ber om listan över
// plattformens kunder. Finns den visas den. Annars skapas en opublicerad källa med byrå-metoden och en körning startar.
// Körningen hittar kunder via bakåtlänkar, PublicWWW, byråns egna kundsidor och sökning, och varje kund kontrolleras mot
// sin egen sida. När körningen är klar publiceras listan av sig själv om den har tillräckligt många (publish.ts).

export const REQUESTS_PER_USER_PER_DAY = 5;
/** En avslutad körning som misslyckats eller gett för få kunder körs inte om förrän det gått så här länge. */
export const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

export type ListState =
  | { state: "have"; slug: string; name: string; customers: number }
  | { state: "searching" }
  | { state: "too-few"; customers: number }
  | { state: "failed" }
  | { state: "none" }
  /** Taket för dagen är nått, eller källan hanteras redan av en admin. Försök igen senare. */
  | { state: "later" }
  | { state: "disabled" };

const ACTIVE = new Set(["queued", "running"]);

/** Vad kunden ska se för en domän, ur källan som finns (eller inte). Ren. */
export function stateOf(s: SourceState | null): ListState {
  if (!s) return { state: "none" };
  if (s.published) return { state: "have", slug: s.slug, name: s.name, customers: s.customers };
  if (!s.lastRun) return { state: "none" };
  if (ACTIVE.has(s.lastRun.status)) return { state: "searching" };
  if (s.lastRun.status === "success") return { state: "too-few", customers: s.customers };
  return { state: "failed" };
}

/** Ett namn som går att visa för kunderna: webbplatsens titel ("Leads Sverige AB I Ledande inom SEO") kortas till företagsnamnet. Ren. */
export function displayName(name: string | null | undefined, domain: string): string {
  const first = (name ?? "").split(/\s[|·–—-]\s|\sI\s|:\s/)[0]?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "";
  if (first.length >= 2) return first;
  const label = domain.split(".")[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface RequestInput {
  domain: string;
  name: string | null;
  orgId: string;
  userId: string;
  profileId: string | null;
}

export interface RequestDeps {
  enabled: () => boolean;
  find: (domain: string) => Promise<SourceState | null>;
  usage: () => Promise<{ newToday: number; activeRuns: number }>;
  spend: () => Promise<Spend>;
  userRequestsToday: (userId: string) => Promise<number>;
  create: (a: { name: string; domain: string }) => Promise<string>;
  start: (supplierId: string) => Promise<void>;
  record: (r: { domain: string; supplierId: string; orgId: string; userId: string; profileId: string | null }) => Promise<void>;
  now: () => number;
}

export const defaultRequestDeps: RequestDeps = {
  enabled: autoEnabled,
  find: getSourceByDomain,
  async usage() {
    const { rows } = await pool.query(
      `select
         (select count(*)::int from suppliers where method = 'agency' and created_at > now() - interval '24 hours') as new_today,
         (select count(*)::int from scrape_runs r join suppliers s on s.id = r.supplier_id
            where s.method = 'agency' and r.status in ('queued','running') and coalesce(r.heartbeat_at, r.created_at) > now() - interval '15 minutes') as active`,
    );
    return { newToday: rows[0].new_today as number, activeRuns: rows[0].active as number };
  },
  spend: spendLast24h,
  async userRequestsToday(userId) {
    const { rows } = await pool.query(`select count(*)::int n from list_requests where requested_by = $1 and created_at > now() - interval '24 hours'`, [userId]);
    return rows[0].n as number;
  },
  async create(a) {
    return (await ensureAgencySupplier(a)).id;
  },
  async start(supplierId) {
    try {
      await triggerRun(supplierId);
    } catch (e) {
      // En körning som redan pågår är precis vad vi vill ha. Allt annat är ett riktigt fel.
      if (!(e instanceof RunStartError)) throw e;
    }
  },
  async record(r) {
    await pool.query(
      `insert into list_requests (domain, supplier_id, org_id, requested_by, profile_id) values ($1,$2,$3,$4,$5) on conflict (domain, org_id) do nothing`,
      [r.domain, r.supplierId, r.orgId, r.userId, r.profileId],
    );
  },
  now: Date.now,
};

/** Vad kunden ser för domänen just nu, utan att starta något. */
export async function getListState(domain: string | null, find: RequestDeps["find"] = getSourceByDomain): Promise<ListState> {
  const d = normalizeDomain(domain);
  return d ? stateOf(await find(d)) : { state: "none" };
}

/** Ber om kundlistan för en domän. Startar en sökning om vi inte redan har eller söker efter den. */
export async function requestCustomerList(i: RequestInput, deps: RequestDeps = defaultRequestDeps): Promise<ListState> {
  const domain = normalizeDomain(i.domain);
  if (!domain) return { state: "none" };
  if (!deps.enabled()) return { state: "disabled" };

  const existing = await deps.find(domain);
  const current = stateOf(existing);
  const link = (supplierId: string) => deps.record({ domain, supplierId, orgId: i.orgId, userId: i.userId, profileId: i.profileId });

  // Vi har den, eller någon söker redan: koppla bolaget till samma källa i stället för att starta en till.
  if (existing && (current.state === "have" || current.state === "searching")) {
    await link(existing.id);
    return current;
  }
  // En källa en admin byggt på annat sätt rörs inte.
  if (existing && existing.method !== "agency") return { state: "later" };
  // Ett färskt misslyckat eller tunt resultat körs inte om direkt: det kostar krediter och gav inget nyss.
  if (existing?.lastRun && deps.now() - existing.lastRun.at.getTime() < RETRY_AFTER_MS && (current.state === "too-few" || current.state === "failed")) {
    await link(existing.id);
    return current;
  }

  if ((await deps.userRequestsToday(i.userId)) >= REQUESTS_PER_USER_PER_DAY) return { state: "later" };
  const usage = await deps.usage();
  if ((!existing && usage.newToday >= MAX_NEW_AGENCIES_PER_DAY) || usage.activeRuns >= MAX_ACTIVE_AGENCY_RUNS || overDailyCap(await deps.spend())) return { state: "later" };

  const supplierId = existing?.id ?? (await deps.create({ name: displayName(i.name, domain), domain }));
  await deps.start(supplierId);
  await link(supplierId);
  return { state: "searching" };
}
