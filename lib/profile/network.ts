import { pool } from "@/lib/db";
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
}

export const defaultNetworkDeps: NetworkDeps = {
  resolveLogo: (i) => resolveLogo(i),
  // Profilen är för admin, som ska se alla källor, även de som ännu inte är publicerade.
  getPresence: (companyId) => getPresence(companyId, { includeUnpublished: true }),
  async suppliersByDomain(domains) {
    if (domains.length === 0) return new Map();
    const { rows } = await pool.query(`select slug, domain from suppliers where domain = any($1)`, [domains]);
    return new Map(rows.map((r) => [r.domain as string, r.slug as string]));
  },
};

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
const NO_LOGO: LogoResult = { path: null, source: "none", supplierSlug: null };

export async function buildNetwork(
  i: { creator: (Creator & { phrase?: CreditPhrase; classification?: Classification | null }) | null; siteDomain: string | null; companyName: string | null; platformLinks: PlatformLink[]; companyId: string | null },
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
  const creator: ProfileCreator | null = i.creator
    ? { name: i.creator.name, url: i.creator.url, domain: i.creator.domain, logoPath: creatorLogo.path, supplierSlug: creatorLogo.supplierSlug, phrase: i.creator.phrase, kind: i.creator.classification?.kind ?? null, kindSource: i.creator.classification?.source ?? null, basis: "footer" }
    : agencyFromPresence(presence);
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
