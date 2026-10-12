import { OUTCOMES, type CallOutcome } from "@/lib/calls/outcomes";

export type KeyAction =
  | { type: "outcome"; value: CallOutcome }
  | { type: "save" | "skip" | "back" | "note" | "copy" | "call" | "info" | "undo" | "help" | "blur" | "close" }
  | null;

export type KeyInput = {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  /** Var fokus ligger: ett textfält, en knapp/länk eller ingenting särskilt. */
  target: "field" | "button" | "other";
  /** Går det att spara just nu (utfall valt, obligatoriska fält ifyllda)? */
  canSave: boolean;
  dialogOpen?: boolean;
};

/**
 * Tangent -> handling. Ren funktion, så att hela tangentmodellen går att testa.
 *
 * Reglerna är de gamla portalens läxor: siffror och bokstäver gör ingenting medan man skriver (annars
 * flyger man genom kön mitt i en anteckning), Esc lämnar fältet så att tangenterna lever igen, och Enter
 * på en knapp är knappens egen (ingen dubbelhandling).
 */
export function keyAction(e: KeyInput): KeyAction {
  const mod = e.meta || e.ctrl;
  const key = e.key;

  if (e.dialogOpen) return key === "Escape" || key === "?" ? { type: "close" } : null;

  if (key === "Escape") return e.target === "field" ? { type: "blur" } : null;

  // Spara med ⌘/Ctrl+Enter gäller överallt, även i anteckningen.
  if (key === "Enter" && mod && !e.alt) return e.canSave ? { type: "save" } : null;
  // Vanlig Enter: textfält och knappar hanterar den själva.
  if (key === "Enter") return e.target === "other" && e.canSave ? { type: "save" } : null;

  // ⌘Z ångrar, men inte medan man skriver (där är det textfältets egen ångra).
  if (mod && !e.alt && key.toLowerCase() === "z") return e.target === "field" ? null : { type: "undo" };
  if (mod || e.alt) return null;
  if (e.target === "field") return null;

  if (/^[0-9]$/.test(key)) {
    const o = OUTCOMES.find((x) => x.key === key);
    return o ? { type: "outcome", value: o.value } : null;
  }
  switch (key) {
    case "s": case "S": case "ArrowRight": return { type: "skip" };
    case "ArrowLeft": return { type: "back" };
    case "n": case "N": return { type: "note" };
    case "c": case "C": return { type: "copy" };
    case "v": case "V": return { type: "call" };
    case "i": case "I": return { type: "info" };
    case "z": case "Z": return { type: "undo" };
    case "?": return { type: "help" };
    default: return null;
  }
}
