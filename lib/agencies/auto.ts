import { isAnthropicConfigured } from "@/lib/ai/model";
import { pool } from "@/lib/db";
import { parseProfileInput } from "@/lib/profile/input";
import { isPlacesConfigured, searchPlaces, nameMatches } from "@/lib/profile/places";
import { failProfile, startProfile } from "@/lib/profile/store";
import { triggerProfileBuild } from "@/lib/profile/trigger";
import type { ProfileCreator } from "@/lib/profile/types";
import { triggerRun } from "@/lib/runs/start";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { isSameOrSubdomain } from "./match";
import { overDailyCap, spendLast24h, type Spend } from "./spend";
import { ensureAgencySupplier } from "./store";

// Startar en byrå automatiskt när en profil hittar en "Skapad av ...": byrån får en egen (opublicerad) källa, en
// egen profil och en körning som letar kunder. Det görs bara om vi inte redan har en profil eller en källa för byrån,
// och inom tak, så att en omgång profiler inte kan ge en kostnadstopp. Allt här är ett tillägg: ett fel stoppar
// aldrig bygget av kundens profil.

/** Så många nya byråer per dygn, alla vägar in. */
export const MAX_NEW_AGENCIES_PER_DAY = 12;
/** Så många byråkörningar samtidigt. */
export const MAX_ACTIVE_AGENCY_RUNS = 3;

export type AutoResult =
  | { started: true; domain: string }
  | { started: false; reason: "disabled" | "no-agency" | "not-agency" | "no-domain" | "own-site" | "agency-profile" | "known" | "daily-cap" | "busy" | "error" };

export interface AutoDeps {
  enabled: () => boolean;
  /** Byråns domän: den kreditraden länkade till, annars en träff hos Google med rätt namn. */
  resolveDomain: (creator: ProfileCreator) => Promise<string | null>;
  known: (domain: string) => Promise<boolean>;
  usage: () => Promise<{ newToday: number; activeRuns: number }>;
  /** Dygnets förbrukning av OpenSEO-krediter och Claude-kronor. */
  spend: () => Promise<Spend>;
  start: (agency: { name: string; domain: string; logoPath: string | null; foundVia?: { ip: string; sites: number } | null }) => Promise<boolean>;
}

export interface AutoInput {
  creator: ProfileCreator | null;
  /** Domänen på profilen som byggs, så att en sajt som är sin egen byrå hoppas över. */
  customerDomain: string | null;
  /** Profilen som byggs är själv en byrås: kedjan fortsätter inte. */
  isAgencyProfile: boolean;
  /** Byrån hittades via servern, inte via en kredit: noteras på källan så att en admin ser det. */
  foundVia?: { ip: string; sites: number } | null;
}

/**
 * På som standard, men bara när kundsökningen kan fungera: Claude måste vara konfigurerat. PublicWWW är ett tillägg som
 * kan saknas (kvoten tar slut) utan att körningen faller. AGENCY_AUTOSTART=off stänger av.
 */
export const autoEnabled = (): boolean => process.env.AGENCY_AUTOSTART !== "off" && isAnthropicConfigured();

export const defaultAutoDeps: AutoDeps = {
  enabled: autoEnabled,
  async resolveDomain(creator) {
    const linked = normalizeDomain(creator.domain);
    if (linked) return linked;
    if (!isPlacesConfigured()) return null;
    const hits = await searchPlaces(creator.name, 5);
    return hits.find((h) => h.domain && nameMatches(creator.name, h.name))?.domain ?? null;
  },
  async known(domain) {
    const { rows } = await pool.query(
      `select
         exists (select 1 from company_profiles where domain = $1 and (status in ('queued','running','done') or (status = 'error' and created_at > now() - interval '24 hours'))) as profile,
         exists (select 1 from suppliers where domain = $1 and method = 'agency') as source`,
      [domain],
    );
    return Boolean(rows[0]?.profile || rows[0]?.source);
  },
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
  async start(agency) {
    const source = await ensureAgencySupplier(agency);
    // Någon hann före, till exempel en annan profil som hittade samma byrå samtidigt.
    if (!source.created) return false;
    const parsed = parseProfileInput(agency.domain);
    if (parsed.kind === "url") {
      const profile = await startProfile(parsed, { id: null });
      if (!profile.reused) {
        try {
          await triggerProfileBuild(profile.id, { orgnr: null });
        } catch (e) {
          await failProfile(profile.id, `Kunde inte starta bygget: ${e instanceof Error ? e.message : "okänt fel"}`);
        }
      }
    }
    await triggerRun(source.id);
    return true;
  },
};

export async function maybeStartAgency(i: AutoInput, deps: AutoDeps = defaultAutoDeps): Promise<AutoResult> {
  try {
    if (!deps.enabled()) return { started: false, reason: "disabled" };
    if (!i.creator) return { started: false, reason: "no-agency" };
    if (i.isAgencyProfile) return { started: false, reason: "agency-profile" };
    // Bara en domän som bedömts vara en byrå. "Powered by"-länkar och okända namn startar aldrig något.
    if (i.creator.kind !== "agency") return { started: false, reason: "not-agency" };

    const domain = await deps.resolveDomain(i.creator);
    if (!domain) return { started: false, reason: "no-domain" };
    if (i.customerDomain && isSameOrSubdomain(i.customerDomain, domain)) return { started: false, reason: "own-site" };
    if (await deps.known(domain)) return { started: false, reason: "known" };

    const usage = await deps.usage();
    if (usage.newToday >= MAX_NEW_AGENCIES_PER_DAY || overDailyCap(await deps.spend())) return { started: false, reason: "daily-cap" };
    if (usage.activeRuns >= MAX_ACTIVE_AGENCY_RUNS) return { started: false, reason: "busy" };

    return (await deps.start({ name: i.creator.name, domain, logoPath: i.creator.logoPath, ...(i.foundVia ? { foundVia: i.foundVia } : {}) })) ? { started: true, domain } : { started: false, reason: "known" };
  } catch (e) {
    console.error("[byrå] kunde inte starta byrån automatiskt:", e instanceof Error ? e.message : e);
    return { started: false, reason: "error" };
  }
}

/** Var en byrå står, för "Skapad av"-kortet: profileras den, och hur många kunder har vi hittat. */
export async function getAgencyState(i: { domain: string | null; slug: string | null }): Promise<{ id: string; slug: string; published: boolean; customers: number; profiling: boolean; lastRun: { status: string; error: string | null; note: string | null } | null } | null> {
  if (!i.domain && !i.slug) return null;
  const { rows } = await pool.query(
    `select s.id, s.slug, s.published, s.domain,
       (select jsonb_build_object('status', r.status, 'error', r.error, 'note', r.note) from scrape_runs r where r.supplier_id = s.id order by r.created_at desc limit 1) as last_run,
       (select count(*)::int from company_signals cs where cs.supplier_id = s.id) as customers,
       exists (select 1 from company_profiles p where p.domain = s.domain and p.status in ('queued','running')) as profiling
     from suppliers s where s.method = 'agency' and (($1::text is not null and s.domain = $1) or ($2::text is not null and s.slug = $2)) limit 1`,
    [i.domain, i.slug],
  );
  const r = rows[0];
  return r ? { id: r.id, slug: r.slug, published: r.published, customers: r.customers, profiling: r.profiling, lastRun: r.last_run ?? null } : null;
}
