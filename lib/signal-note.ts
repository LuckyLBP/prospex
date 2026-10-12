// Klientsäker. Texten under ett företag om varför det finns i listan, enligt copy-reglerna:
// leverantörer och namngivna plattformar får "Vi har ingen koppling till X", branschlistor gör det inte.

export type NoteSignal = { supplier: string; kind: "supplier" | "list"; names_brand: boolean };

const join = (names: string[], word: string) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${word} ${names[names.length - 1]}`;
const uniq = (xs: string[]) => [...new Set(xs)];

export function signalNote(signals: readonly NoteSignal[]): string {
  const suppliers = uniq(signals.filter((s) => s.kind === "supplier").map((s) => s.supplier));
  const lists = uniq(signals.filter((s) => s.kind === "list").map((s) => s.supplier));
  const branded = uniq(signals.filter((s) => s.kind === "list" && s.names_brand).map((s) => s.supplier));

  const parts: string[] = [];
  if (suppliers.length) parts.push(`Signal: företag med ${join(suppliers, "och")} som leverantör.`);
  if (lists.length) parts.push(`${lists.length === 1 ? "Finns i listan" : "Finns i listorna"} ${join(lists, "och")}.`);
  const named = [...suppliers, ...branded];
  if (named.length) parts.push(`Vi har ingen koppling till ${join(named, "eller")}.`);
  return parts.join(" ");
}
