/**
 * Swedish phone numbers, normalised to E.164 (+46…).
 *
 * A website writes the same number six ways -- "08-123 45 67",
 * "+46 (0)8 1234567", "0046812345678" -- and a record browser where the same
 * salon appears under three of them is a record browser nobody searches in.
 * One stored form also lets the search box rewrite what a user types into what
 * is stored (see lib/records/search.ts).
 */

/** Swedish subscriber numbers are 7-9 digits after the leading trunk 0. */
const NATIONAL_MIN = 7;
const NATIONAL_MAX = 9;

export function normalizeSwedishPhone(input: string | null | undefined): string | null {
  if (!input) return null;

  // "+46 (0)8-123 45 67": the parenthesised trunk zero is dropped by the
  // country code and must not become part of the number.
  let text = input.trim().replace(/\((0)\)/g, "");
  const hasPlus = text.startsWith("+");
  let digits = text.replace(/\D/g, "");
  if (digits === "") return null;

  if (hasPlus || digits.startsWith("00")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    // Only Swedish numbers are normalised; anything else is left alone
    // rather than mangled into a Swedish one.
    if (!digits.startsWith("46")) return null;
    digits = digits.slice(2);
  } else if (digits.startsWith("46") && digits.length > NATIONAL_MAX + 2) {
    // "46812345678" written without a plus.
    digits = digits.slice(2);
  }

  // The trunk prefix is national notation and is not part of E.164.
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (digits === "") return null;

  if (digits.length < NATIONAL_MIN || digits.length > NATIONAL_MAX) return null;
  // No Swedish area or mobile prefix starts with 0 after the trunk digit.
  if (digits.startsWith("0")) return null;

  return `+46${digits}`;
}

/** +46812345678 -> "08-123 45 67", for display only. */
export function formatSwedishPhone(e164: string | null | undefined): string | null {
  if (!e164 || !e164.startsWith("+46")) return e164 ?? null;
  const national = `0${e164.slice(3)}`;
  // Mobile numbers group 3-3-2-2, landlines by area code length; a single
  // readable grouping is enough here and never changes the stored value.
  if (national.startsWith("07") && national.length === 10) {
    return `${national.slice(0, 3)}-${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`;
  }
  const areaLength = national.startsWith("08") ? 2 : 3;
  const area = national.slice(0, areaLength);
  const rest = national.slice(areaLength);
  const grouped = rest.replace(/(\d{3})(?=\d)/, "$1 ").replace(/(\d{2})(?=\d{2}$)/, "$1 ");
  return `${area}-${grouped}`;
}
