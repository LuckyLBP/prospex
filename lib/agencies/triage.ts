import { normalizeDomain } from "@/lib/scrapers/domain";
import { anchorNamesAgency, isSameOrSubdomain, type Agency } from "./match";

// Från en lista bakåtlänkar till en lista kandidater. Bakåtlänksindexet ger allt som länkar till byrån, och det mesta är
// inte kunder: kataloger, listningar, omdirigeringar, partner- och sponsorsidor. Reglerna här tar bort det uppenbara och
// sorterar resten så att de starkaste kandidaterna kontrolleras först. Själva beviset kommer först när verifyCandidate
// har sett byrån på kundens egen sida, så en kandidat som slank igenom här kostar bara ett sidhämtning.

export interface BacklinkRow {
  domainFrom: string;
  urlFrom: string;
  urlTo: string | null;
  anchor: string | null;
  itemType: string;
  spamScore: number | null;
  isBroken?: boolean;
  firstSeen?: string | null;
}

export type Strength = "credit" | "name" | "weak";

export interface BacklinkCandidate {
  domain: string;
  /** Sidan som länkar till byrån. */
  urlFrom: string;
  anchor: string | null;
  strength: Strength;
  /** Sidan ser ut som en partner- eller sponsorsida: verifieringen avgör, men den kommer sist. */
  partner: boolean;
}

export interface Dropped {
  domain: string;
  reason: "own-domain" | "redirect" | "listing" | "directory" | "spam" | "no-domain";
}

/** Kataloger, listningssajter och registertjänster. Listan växer med det vi ser. */
const DIRECTORY_DOMAINS = [
  "leadster.ai", "revenuebase.ai", "webbyratoppen.se", "europes.run", "konigle.com", "cl0q.com", "five.co.in", "robuta.com",
  "eniro.se", "hitta.se", "allabolag.se", "ratsit.se", "merinfo.se", "proff.se", "reco.se", "uc.se", "oppettider.nu",
  "trustpilot.com", "yelp.com", "facebook.com", "instagram.com", "linkedin.com", "youtube.com", "twitter.com", "x.com",
  "pinterest.com", "google.com", "clutch.co", "sortlist.com", "goodfirms.co", "similarweb.com", "semrush.com", "ahrefs.com",
  "byralistan.se", "superbcompanies.com", "businesswith.se", "krowdbase.com", "tendermap.com", "heroagencies.com", "sortlist.fr",
];

const LISTING_PATH = /\/(?:foretag|företag|company|companies|listings?|directory|directorio|byra|byrå|domains?|site|sites|katalog|profil)\//i;
const PARTNER_TEXT = /partner|sponsor|samarbet/i;
/** DataForSEO döljer redan 40 och uppåt, men gränsen hålls här också för anrop utan det filtret. */
export const SPAM_DROP = 40;

/** Står byråns domän i adressens sökväg eller frågedel? Ren. */
export function embedsDomain(url: string, agencyDomain: string): boolean {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`.toLowerCase().includes(agencyDomain.toLowerCase());
  } catch {
    return false;
  }
}

const clean = (d: string) => normalizeDomain(d) ?? "";
const RANK: Record<Strength, number> = { credit: 0, name: 1, weak: 2 };

function strengthOf(anchor: string | null, agency: Agency): Strength {
  const named = anchorNamesAgency(anchor, agency);
  if (named === "credit") return "credit";
  // "hemsida" och liknande, utan byråns namn, är oftast också en kredit men mindre säkert.
  if (named === "name" || (anchor && /^(?:hemsida|webbplats|webbdesign|webbyrå)$/i.test(anchor.trim()))) return "name";
  return "weak";
}

/** Rensar och sorterar bakåtlänkarna. En rad per domän: den starkaste. Ren. */
export function triageBacklinks(rows: readonly BacklinkRow[], agency: Agency): { candidates: BacklinkCandidate[]; dropped: Dropped[] } {
  const best = new Map<string, BacklinkCandidate>();
  const dropped: Dropped[] = [];
  const drop = (domain: string, reason: Dropped["reason"]) => dropped.push({ domain, reason });

  for (const row of rows) {
    const domain = clean(row.domainFrom);
    if (!domain) { drop(row.domainFrom, "no-domain"); continue; }
    if (isSameOrSubdomain(domain, agency.domain)) { drop(domain, "own-domain"); continue; }
    if (row.itemType === "redirect") { drop(domain, "redirect"); continue; }
    if (/[?&]utm_source=gbp\b/i.test(row.urlTo ?? "")) { drop(domain, "listing"); continue; }
    if (DIRECTORY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) { drop(domain, "directory"); continue; }
    if (LISTING_PATH.test(row.urlFrom)) { drop(domain, "listing"); continue; }
    // Speglar och länkfarmer bär byråns domän i sin egen adress ("server.example.com/www.byran.se"). Det är ingen kund.
    if (embedsDomain(row.urlFrom, agency.domain)) { drop(domain, "listing"); continue; }
    if ((row.spamScore ?? 0) >= SPAM_DROP) { drop(domain, "spam"); continue; }

    let path = "";
    try { path = new URL(row.urlFrom).pathname; } catch { /* en trasig adress är ingen partnersida */ }
    const partner = PARTNER_TEXT.test(path) || PARTNER_TEXT.test(row.anchor ?? "");
    const candidate: BacklinkCandidate = { domain, urlFrom: row.urlFrom, anchor: row.anchor, strength: strengthOf(row.anchor, agency), partner };
    const current = best.get(domain);
    if (!current || RANK[candidate.strength] < RANK[current.strength]) best.set(domain, candidate);
  }

  // Starkast först, partnersidor sist, annars i den ordning indexet gav dem (nyast först).
  const candidates = [...best.values()].sort((a, b) => Number(a.partner) - Number(b.partner) || RANK[a.strength] - RANK[b.strength]);
  return { candidates, dropped };
}
