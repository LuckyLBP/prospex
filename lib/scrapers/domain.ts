/**
 * Domain normalisation -- the whole basis for deduplication.
 *
 * Every collector produces something URL-shaped and they all disagree about
 * the details: PublicWWW returns bare hosts, ViewDNS returns hosts with a
 * trailing dot sometimes, the table-sync scripts return whatever someone typed
 * into a website field ten years ago ("WWW.Salong.se/boka"). One function
 * settles it, so "salong.se" and "https://WWW.Salong.se/boka" are one record.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  // "@" is never part of a domain, and letting one through would be worse
  // than a rejection: new URL() reads everything before it as userinfo, so
  // "mailto:a@b.se" would quietly normalise to the domain "b.se".
  if (trimmed.includes("@")) return null;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") return null;

  // A bare host has no scheme, and new URL() requires one.
  const withScheme = scheme ? trimmed : `http://${trimmed}`;

  let hostname: string;
  try {
    hostname = new URL(withScheme).hostname;
  } catch {
    return null;
  }

  // The root label's trailing dot is legal in DNS and noise here.
  let host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("www.")) host = host.slice(4);

  // A hostname with no dot is either a local name or a parse accident; either
  // way it is not a company's domain.
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;

  return host;
}

/** The canonical https:// URL for a normalised domain. */
export function websiteUrl(domain: string): string {
  return `https://${domain}`;
}
