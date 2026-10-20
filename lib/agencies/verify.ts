import { auditSite } from "@/lib/enrich/audit";
import { isInterstitial, toText } from "@/lib/enrich/extract";
import { findCreator } from "@/lib/profile/creator";
import { PageBudget, safeFetch } from "@/lib/profile/safe-fetch";
import { agencyFingerprint, anchorNamesAgency, contactsAgency, creatorMatchesAgency, footerLinksTo, footerTextCredit, isSameOrSubdomain, pageMentionsDomain, type Agency } from "./match";

// Kontrollen som gör att ingen kund läggs in på någon annans ord: kandidatens EGEN sida hämtas, och byrån måste synas
// där. Det gäller oavsett om kandidaten kom från bakåtlänkar, PublicWWW, ViewDNS, vår katalog eller Claude.
// Starkast först:
//
//   credit       kreditraden ("Skapad av ...") pekar ut byrån med länk, på domän eller kärnnamn
//   text-credit  kreditraden finns men utan länk: "Byggd med ♥ av Capace Media"
//   footer-link  sidfoten länkar till byråns domän utan någon kreditfras
//   contact      sidan länkar till en e-postadress hos byrån (mailto:offert@byran.se): byrån tar emot sidans förfrågningar
//   fingerprint  inget synligt, men koden bär byråns namn: generator-tagg, tema eller resurser från byråns domän
//   portfolio    byråns EGEN sida (som vi hämtat själva, inte Claudes referat) listar kunden, och kundens sida visar
//                inte en annan byrå
//   backlink     kundens sida släpper inte in oss, men en bakåtlänk med en tydlig kredittext pekar ut den. Svagast.

export type Confidence = "credit" | "text-credit" | "footer-link" | "contact" | "fingerprint" | "portfolio" | "backlink";

export type Verdict =
  | { accepted: true; confidence: Confidence; evidenceUrl: string; evidence: string }
  | { accepted: false; reason: "unreachable" | "blocked" | "no-credit" | "own-domain" }
  /** Sidan visar en annan byrå. `to` är dess namn, för att kunna notera ett byte. */
  | { accepted: false; reason: "other-agency"; to: string };

export interface VerifyDeps {
  safeFetch: typeof safeFetch;
}

export const defaultVerifyDeps: VerifyDeps = { safeFetch };

/** Byråns egen sida som ska styrka ett förslag, redan hämtad av koden. */
export interface PortfolioProof {
  url: string;
  html: string | null;
}

/** Vad bakåtlänksindexet vet om kandidaten: sidan som länkar till byrån och länktexten. */
export interface BacklinkHint {
  urlFrom: string | null;
  anchor: string | null;
}

type PageCheck = { verdict: Verdict } | { contradicted: string } | null;

/** Kontrollerar en hämtad sida. Null = inget belägg här. Ett "contradicted" betyder att sidan visar en annan byrå. */
function checkPage(html: string, finalUrl: string, domain: string, agency: Agency): PageCheck {
  const audit = auditSite(html, finalUrl);
  const creator = findCreator(html, domain, audit.credit);
  if (creatorMatchesAgency(creator, agency)) return { verdict: { accepted: true, confidence: "credit", evidenceUrl: finalUrl, evidence: `Sidfoten anger ${creator!.name}` } };
  const text = footerTextCredit(html, agency);
  if (text) return { verdict: { accepted: true, confidence: "text-credit", evidenceUrl: finalUrl, evidence: `Sidfoten: ${text}` } };
  if (footerLinksTo(html, agency.domain)) return { verdict: { accepted: true, confidence: "footer-link", evidenceUrl: finalUrl, evidence: `Sidfoten länkar till ${agency.domain}` } };
  const mail = contactsAgency(html, agency.domain);
  if (mail) return { verdict: { accepted: true, confidence: "contact", evidenceUrl: finalUrl, evidence: `Sidan länkar till e-postadressen ${mail}` } };
  const print = agencyFingerprint(html, agency);
  if (print) return { verdict: { accepted: true, confidence: "fingerprint", evidenceUrl: finalUrl, evidence: print } };
  // Visar sidan en annan byrå är byråns portfölj fel eller föråldrad.
  return creator ? { contradicted: creator.name } : null;
}

export async function verifyCandidate(domain: string, agency: Agency, deps: VerifyDeps = defaultVerifyDeps, proof?: PortfolioProof | null, hint?: BacklinkHint | null): Promise<Verdict> {
  if (isSameOrSubdomain(domain, agency.domain)) return { accepted: false, reason: "own-domain" };

  // En adress som inte svarar provas med http och med www, eftersom en del sajter bara svarar på en av dem.
  let page = await deps.safeFetch(`https://${domain}`, domain, new PageBudget(1, 0));
  if (!page.html && page.status === 0 && !page.problem?.includes("inte en offentlig")) {
    page = await deps.safeFetch(`http://${domain}`, domain, new PageBudget(1, 0));
    if (!page.html && page.status === 0) page = await deps.safeFetch(`https://www.${domain}`, domain, new PageBudget(1, 0));
  }
  const blocked = !page.html ? [401, 403, 429, 503].includes(page.status) : isInterstitial(page.html);
  if (!page.html || blocked) {
    // En sida som inte släpper in oss kan ändå styrkas av byråns egen sida eller av en bakåtlänk, men en som inte svarar gör det inte.
    if (blocked && portfolioListsCustomer(proof, domain, agency)) return portfolioVerdict(proof!, agency);
    if (blocked && hint && anchorNamesAgency(hint.anchor, agency) === "credit" && hint.urlFrom) {
      return { accepted: true, confidence: "backlink", evidenceUrl: hint.urlFrom, evidence: `Länk till ${agency.domain} med texten "${(hint.anchor ?? "").slice(0, 60)}"` };
    }
    return { accepted: false, reason: blocked ? "blocked" : "unreachable" };
  }

  const home = checkPage(page.html, page.finalUrl, domain, agency);
  if (home && "verdict" in home) return home.verdict;
  let contradicted = home && "contradicted" in home ? home.contradicted : null;

  // En sida som nästan inte har någon text utan JavaScript går inte att läsa, men en tydlig kredittext i bakåtlänken räcker.
  if (!contradicted && toText(page.html).length < 150 && hint?.urlFrom && anchorNamesAgency(hint.anchor, agency) === "credit") {
    return { accepted: true, confidence: "backlink", evidenceUrl: hint.urlFrom, evidence: `Länk till ${agency.domain} med texten "${(hint.anchor ?? "").slice(0, 60)}" (sidan visar ingen text utan JavaScript)` };
  }

  // Bakåtlänksindexet vet vilken sida som länkar till byrån. Kreditraden ligger ofta i en sidfot som finns på alla
  // sidor, men den sidan är den säkraste att titta på när startsidan inte visar något.
  if (!contradicted && hint?.urlFrom && sameSite(hint.urlFrom, domain) && normPage(hint.urlFrom) !== normPage(page.finalUrl)) {
    const other = await deps.safeFetch(hint.urlFrom, domain, new PageBudget(1, 0)).catch(() => null);
    if (other?.html && !isInterstitial(other.html)) {
      const found = checkPage(other.html, other.finalUrl, domain, agency);
      if (found && "verdict" in found) return found.verdict;
      if (found && "contradicted" in found) contradicted = found.contradicted;
    }
  }

  if (!contradicted && portfolioListsCustomer(proof, domain, agency)) return portfolioVerdict(proof!, agency);
  return contradicted ? { accepted: false, reason: "other-agency", to: contradicted } : { accepted: false, reason: "no-credit" };
}

const normPage = (u: string) => u.replace(/#.*$/, "").replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/i, "").toLowerCase();

function sameSite(url: string, domain: string): boolean {
  try {
    return isSameOrSubdomain(new URL(url).hostname, domain);
  } catch {
    return false;
  }
}

function portfolioListsCustomer(proof: PortfolioProof | null | undefined, domain: string, agency: Agency): boolean {
  if (!proof?.html) return false;
  let host: string;
  try {
    host = new URL(proof.url).hostname;
  } catch {
    return false;
  }
  return isSameOrSubdomain(host, agency.domain) && pageMentionsDomain(proof.html, domain);
}

function portfolioVerdict(proof: PortfolioProof, agency: Agency): Verdict {
  return { accepted: true, confidence: "portfolio", evidenceUrl: proof.url, evidence: `${agency.name} listar kunden på sin egen webbplats` };
}
