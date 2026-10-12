import { CARD_BATCH_MAX } from "./card-types";

/** Hur många kort framåt och bakåt klienten vill ha färdiga. */
export const AHEAD = 8;
export const BEHIND = 2;

/**
 * Vilka kort som saknas i fönstret runt `index`, närmast först, högst ett batch. Därför är nästa kort en ren
 * setState: klienten hämtar långt innan man kommer dit.
 */
export function missingIds(ids: readonly string[], index: number, have: ReadonlySet<string>, max = CARD_BATCH_MAX): string[] {
  const from = Math.max(0, index - BEHIND);
  const to = Math.min(ids.length, index + AHEAD);
  const out: string[] = [];
  // Framåt först (det man ska till), sedan bakåt.
  for (let i = Math.max(index, from); i < to && out.length < max; i++) if (!have.has(ids[i])) out.push(ids[i]);
  for (let i = index - 1; i >= from && out.length < max; i--) if (!have.has(ids[i])) out.push(ids[i]);
  return out;
}
