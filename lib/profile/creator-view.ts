import { agencyKey } from "./creator";
import type { CompanyProfile, ProfileCreator } from "./types";

// Byrån som visas under "Skapad av". Äldre profiler, och bygge där nätverket föll bort, saknar `creator` men har ändå
// kreditfaktan som tjänsteraden "Webbplats av X" bygger på. Då används den, så att de två aldrig säger emot varandra.

export type ResolvedCreator = ProfileCreator & { evidence: string[] };

export function resolveCreator(profile: Pick<CompanyProfile, "creator" | "facts">): ResolvedCreator | null {
  const credit = profile.facts.find((f) => f.detector === "credit");
  // Byrån kommer från en av våra källor: beläggschippet är faktumet "Finns hos X".
  if (profile.creator && profile.creator.basis && profile.creator.basis !== "footer") {
    const presence = profile.facts.find((f) => f.detector === `presence:${profile.creator!.supplierSlug}`);
    return { ...profile.creator, evidence: presence ? [presence.id] : [] };
  }
  // Beläggschippet visas bara när kreditfaktan handlar om samma byrå. Äldre profiler kunde ha två olika namn här.
  if (profile.creator) return { ...profile.creator, evidence: credit && agencyKey(credit.value) === agencyKey(profile.creator.name) ? [credit.id] : [] };
  if (!credit) return null;
  return { name: credit.value, url: null, domain: null, logoPath: null, supplierSlug: null, evidence: [credit.id] };
}

/** Samma byrå som en av våra källor, jämfört på kärnnamn eller slug. */
export function sameAgency(creatorName: string, source: { name: string; slug: string }): boolean {
  const key = agencyKey(creatorName);
  return key.length > 1 && (key === agencyKey(source.name) || key.replace(/\s+/g, "-") === source.slug);
}
