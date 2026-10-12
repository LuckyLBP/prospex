// Vad någon skrivit i sökfältet ser ut att vara. Klientsäker och bara en ledtråd: servern avgör (input.ts).

/** Allt som varken är org.nr eller webbadress och har minst tre tecken räknas som ett företagsnamn. */
export function kindOf(v: string): "orgnr" | "url" | "name" | null {
  const t = v.trim();
  if (!t) return null;
  if (/^(?:19|20)?\d{6}[-\s]?\d{4}$/.test(t)) return "orgnr";
  if (/^\S+\.[a-zåäö]{2,}(?:\/\S*)?$/i.test(t)) return "url";
  return t.length >= 3 ? "name" : null;
}
