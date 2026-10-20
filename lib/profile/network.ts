import { pool } from "@/lib/db";
import { guessAgencyByServer, type GuessResult } from "@/lib/agencies/server-guess";
import type { Creator, CreditPhrase } from "./creator";
import type { Classification } from "@/lib/agencies/classify";
import { FactBook } from "./facts";
import { resolveLogo, type LogoResult } from "./logos";
import type { PlatformLink } from "./platforms";
import { getPresence, type PresenceItem } from "./presence";
import type { ProfileCreator, ProfilePlatformLink } from "./types";

// Kopplingarna runt ett företag: byråns och företagets egen logotyp, vilka av våra källor som har företaget och vilka
// plattformar webbplatsen länkar till (och vilka av dem som finns som källa hos oss). Allt som går fel ger en tom
// del, aldrig ett misslyckat bygge.

export interface Network {
  creator: ProfileCreator | null;
  companyLogoPath: string | null;
  platformLinks: ProfilePlatformLink[];
  presence: PresenceItem[];
}

export interface NetworkDeps {
  resolveLogo: (i: { name?: string | null; domain: string | null; useCatalog?: boolean }) => Promise<LogoResult>;
  getPresence: (companyId: string | null) => Promise<PresenceItem[]>;
  suppliersByDomain: (domains: string[]) => Promise<Map<string, string>>;
  /** Byrån bakom en sajt utan kredit, utifrån servern den ligger på. */
  guessByServer: (i: { siteDomain: string; ips: string[] }) => Promise<GuessResult>;
}

export const defaultNetworkDeps: NetworkDeps = {
  resolveLogo: (i) => resolveLogo(i),
  // Profilen är för admin, som ska se alla källor, även de som ännu inte är publicerade.
  getPresence: (companyId) => getPresence(companyId, { includeUnpublished: true }),
  guessByServer: (i) => guessAgencyByServer(i),
  async suppliersByDomain(domains) {
    if (domains.length === 0) return new Map();
    const { rows } = await pool.query(`select slug, domain from suppliers where domain = any($1)`, [domains]);
    return new Map(rows.map((r) => [r.domain as string, r.slug as string]));
  },
};

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
const NO_LOGO: LogoResult = { path: null, source: "none", supplierSlug: null };

export async function buildNetwork(
  i: { creator: (Creator & { phrase?: CreditPhrase; classification?: Classification | null }) | null; siteDomain: string | null; companyName: string | null; platformLinks: PlatformLink[]; companyId: string | null; siteIps?: string[] },
  deps: NetworkDeps = defaultNetworkDeps,
): Promise<Network> {
  const [creatorLogo, companyLogo, presence, suppliers] = await Promise.all([
    i.creator ? safe(deps.resolveLogo({ name: i.creator.name, domain: i.creator.domain }), NO_LOGO) : Promise.resolve(NO_LOGO),
    i.siteDomain ? safe(deps.resolveLogo({ name: i.companyName, domain: i.siteDomain, useCatalog: false }), NO_LOGO) : Promise.resolve(NO_LOGO),
    safe(deps.getPresence(i.companyId), [] as PresenceItem[]),
    safe(deps.suppliersByDomain(i.platformLinks.map((p) => p.domain)), new Map<string, string>()),
  ]);
  // Ingen kredit i sidfoten: ligger företaget på en byrås egen server eller i dess kundlista är det byrån som skapat det.
  // Samma server räknas som säkert, eftersom en byrås egna servrar bara har byråns egna kunder (kontrollerat för Tundran:
  // adressen pekar på fore.tundran.se).
  let creator: ProfileCreator | null = i.creator
    ? { name: i.creator.name, url: i.creator.url, domain: i.creator.domain, logoPath: creatorLogo.path, supplierSlug: creatorLogo.supplierSlug, phrase: i.creator.phrase, kind: i.creator.classification?.kind ?? null, kindSource: i.creator.classification?.source ?? null, basis: "footer" }
    : agencyFromPresence(presence);
  // Ingen kredit och ingen byrå i våra källor: titta på servern, och på sajterna som ligger på den.
  if (!creator && i.siteDomain && i.siteIps && i.siteIps.length > 0) creator = await guessCreator(i.siteDomain, i.siteIps, deps);
  return {
    creator,
    companyLogoPath: companyLogo.path,
    platformLinks: i.platformLinks.map((p) => ({ domain: p.domain, name: p.name, kind: p.kind, url: p.url, supplierSlug: suppliers.get(p.domain) ?? null })),
    presence,
  };
}

/** Våra egna kopplingar som belägg, så att modellen kan hänvisa till dem. */
export function presenceFacts(book: FactBook, items: readonly PresenceItem[]): void {
  for (const p of items) {
    book.add({
      kind: "directory",
      label: `Finns hos ${p.name}`,
      value: p.kind === "list" ? `lista${p.category ? `, ${p.category}` : ""}` : "källa i vår katalog",
      source: p.sourceUrl ?? "Prospex katalog",
      detector: `presence:${p.slug}`,
    });
  }
}

/** Byrån som företaget hör till enligt våra källor: byråns kundlista först, annars en byrå vars server eller namnserver företaget ligger på. Ren. */
export function agencyFromPresence(presence: readonly PresenceItem[]): ProfileCreator | null {
  const suppliers = presence.filter((p) => p.kind === "supplier");
  const hit = suppliers.find((p) => p.method === "agency") ?? suppliers.find((p) => p.method === "viewdns");
  if (!hit) return null;
  return {
    name: hit.name,
    url: hit.domain ? `https://${hit.domain}` : null,
    domain: hit.domain ?? null,
    logoPath: hit.logoPath,
    supplierSlug: hit.slug,
    kind: "agency",
    kindSource: "rule",
    basis: hit.method === "agency" ? "agency-source" : "same-server",
  };
}

/** Byrån som en server pekar ut, som en gissning med provet bakom sig. Tom om inget säkert svar finns. */
async function guessCreator(siteDomain: string, ips: string[], deps: NetworkDeps): Promise<ProfileCreator | null> {
  const r = await safe(deps.guessByServer({ siteDomain, ips }), { guess: null, reason: "error" } as GuessResult);
  const g = r.guess;
  if (!g) return null;
  const [logo, slugs] = await Promise.all([safe(deps.resolveLogo({ name: g.name, domain: g.domain }), NO_LOGO), safe(deps.suppliersByDomain([g.domain]), new Map<string, string>())]);
  return {
    name: g.name,
    url: g.url,
    domain: g.domain,
    logoPath: logo.path,
    supplierSlug: slugs.get(g.domain) ?? logo.supplierSlug,
    // En byrå som bara driver servern startar ingen kundsökning av sig själv: det gör bara en som sidfötterna pekat ut.
    kind: g.via === "host" ? null : "agency",
    kindSource: "rule",
    basis: "server-guess",
    likely: !g.confirmed,
    confirmed: g.confirmed,
    server: { ip: g.ip, sites: g.sites, credited: g.credited, examples: g.examples, reason: g.reason, via: g.via },
  };
}
