import { revalidateTag } from "next/cache";

export const CATALOGUE_TAG = "catalogue";

/** Rensar det cachade katalogdatat (lib/cached.ts). Gör ingenting utanför Next (skript, tester), där inget cachas. */
export function invalidateCatalogue() {
  try {
    revalidateTag(CATALOGUE_TAG, { expire: 0 });
  } catch {
    // Utanför en förfrågan finns inget att rensa.
  }
}
