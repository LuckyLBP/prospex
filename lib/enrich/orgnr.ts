// Swedish organisation numbers: 10 digits, conventionally written
// XXXXXX-XXXX, with a Luhn (mod 10) check digit as the last digit.

const DIGITS_ONLY = /^\d{10}$/;
const HYPHENATED = /^\d{6}-\d{4}$/;

/** Accepts "XXXXXXXXXX" or "XXXXXX-XXXX" and returns the hyphenated form, or null if malformed. */
export function normalizeOrgNumber(input: string): string | null {
  const trimmed = input.trim();
  let digits: string;

  if (HYPHENATED.test(trimmed)) {
    digits = trimmed.replace("-", "");
  } else if (DIGITS_ONLY.test(trimmed)) {
    digits = trimmed;
  } else {
    return null;
  }

  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

/** Normalizes and Luhn-validates an org number. */
export function isValidOrgNumber(input: string): boolean {
  const normalized = normalizeOrgNumber(input);
  if (!normalized) return false;
  return luhnCheck(normalized.replace("-", ""));
}

function luhnCheck(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[i]);
    const positionFromRight = digits.length - i;
    // Double every second digit counting from the rightmost (check) digit.
    if (positionFromRight % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// FINDING an org number in a page, as opposed to validating one someone typed.
//
// Four filters, and all four are needed. Luhn alone accepts far too much: a
// ten-digit run of characters passes it one time in ten, and a page footer is
// full of them -- bankgiro numbers, dates, phone numbers, VAT numbers.
//
//   1. Luhn. The cheap structural check.
//   2. Third digit >= 2. A Swedish personnummer's third digit is a month
//      (01-12), an organisationsnummer's is 20 or higher. This excludes
//      personal identity numbers, which is both a correctness rule and a data
//      protection one: a sole trader's org number IS their personnummer, and
//      this app has no business storing one.
//   3. First digit is a legal-form group that exists and that Bolagsverket
//      answers for: 2 (state), 3 (foreign), 5 (aktiebolag), 7 (ekonomisk
//      förening), 8 (ideell förening), 9 (handelsbolag). A Swedish phone
//      number starts with 0 or with 46 once the + is gone, so this is what
//      keeps "0730414760" and "+4642178141" out. Before this rule, every
//      stored number starting 0, 1, 4 or 6 failed the registry lookup.
//   4. A keyword nearby, unless the page has exactly one candidate. "Org.nr
//      556677-8899" is an org number; the same digits in a list of twelve
//      reference numbers probably are not.
// ---------------------------------------------------------------------------

const CANDIDATE = /\b(\d{6})[\s-]?(\d{4})\b/g;
const KEYWORD = /(organisationsnummer|orgnr|org\.?\s*nr|org\.?nummer|momsreg|vat)/i;
const KEYWORD_WINDOW = 60;
/** Legal-form groups (first digit) that real organisation numbers use. Not a placeholder like 999999-9999, which passes Luhn. */
export const ORG_GROUP = /^(?!(\d)\1{9}$)[235789]/;

/** The org number a page states about itself, or null. */
export function findOrgNumber(text: string): string | null {
  const candidates: { value: string; start: number; end: number }[] = [];

  CANDIDATE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CANDIDATE.exec(text)) !== null) {
    const digits = `${match[1]}${match[2]}`;
    if (!isValidOrgNumber(digits)) continue;
    // Third digit is the month field in a personnummer.
    if (Number(digits[2]) < 2) continue;
    if (!ORG_GROUP.test(digits)) continue;
    candidates.push({
      value: `${match[1]}-${match[2]}`,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (candidates.length === 0) return null;

  // A LABEL BEFORE THE NUMBER BEATS ONE AFTER IT, because Swedish writes
  // "Org.nr 556677-8899" and because a symmetric window gets this wrong in a
  // way that is easy to miss: in "Bankgiro 556036-0793. Org.nr 556677-8899."
  // the bankgiro number also has "Org.nr" within sixty characters, and would
  // otherwise be stored as the company's organisationsnummer.
  //
  // Each candidate's preceding context stops at the previous candidate, so one
  // number's label can never be read as another's.
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const floor = i === 0 ? 0 : candidates[i - 1].end;
    const from = Math.max(floor, candidate.start - KEYWORD_WINDOW);
    if (KEYWORD.test(text.slice(from, candidate.start))) return candidate.value;
  }

  // Only then a label after the number ("556677-8899 (org.nr)"), bounded the
  // same way by the following candidate.
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const ceiling = i === candidates.length - 1 ? text.length : candidates[i + 1].start;
    const to = Math.min(ceiling, candidate.end + KEYWORD_WINDOW);
    if (KEYWORD.test(text.slice(candidate.end, to))) return candidate.value;
  }

  // No label anywhere, but the page offers exactly one number that survived
  // both structural filters. That is worth keeping; a choice between several
  // unlabelled ones is not.
  return candidates.length === 1 ? candidates[0].value : null;
}
