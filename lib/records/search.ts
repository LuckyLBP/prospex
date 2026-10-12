import { normalizeSwedishPhone } from "@/lib/enrich/phone";

/**
 * Turning what someone typed into the search box into an ilike pattern.
 *
 * Two problems, both of which produce silently wrong results rather than
 * errors:
 *
 *   ESCAPING. `%` and `_` are wildcards in LIKE, so a search for "50_50" would
 *   match "5000" -- and a `\` would escape the character after it. All three
 *   are escaped so a search means what it looks like.
 *
 *   PHONE NUMBERS. Numbers are stored in E.164 (+4681234567) but nobody types
 *   them that way. Without the rewrite, searching "08-123 45 67" -- the form
 *   printed on the very page being searched -- returns nothing.
 */
export function buildSearchNeedle(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed === "") return null;

  const phone = looksLikePhone(trimmed) ? normalizeSwedishPhone(trimmed) : null;
  const base = (phone ?? trimmed).toLowerCase();

  return `%${escapeLike(base)}%`;
}

/** Escapes LIKE's own metacharacters. Backslash first, or it escapes the escapes. */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Digits, spaces, dashes and an optional plus, with enough digits to be a
 * number rather than a house number in an address search.
 */
function looksLikePhone(value: string): boolean {
  if (!/^[+\d\s\-()]+$/.test(value)) return false;
  return value.replace(/\D/g, "").length >= 6;
}
