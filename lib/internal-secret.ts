import { timingSafeEqual } from "node:crypto";

/** Stämmer hemligheten i ett internt anrop med INTERNAL_RUN_SECRET? Utan satt hemlighet stämmer ingenting. */
export function internalSecretMatches(provided: string | null): boolean {
  const expected = process.env.INTERNAL_RUN_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual kastar vid olika längd. Längden är inte hemligheten, så den får kontrolleras först.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
