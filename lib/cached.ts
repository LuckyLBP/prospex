import { unstable_cache } from "next/cache";
import { CATALOGUE_TAG as TAG } from "./catalogue-tag";
import { adminNavCounts } from "./admin-data";
import { getLists, getSource, getSources, getStats, getSuppliers } from "./queries";

// Cachade läsningar av det gemensamma katalogdatat (samma för alla bolag). Det ändras bara när en insamling går klart
// eller en admin ändrar en källa, så det räcker att räkna om då. lib/queries.ts är orört och körs direkt av testerna.
// Bara för serverkod i appen: unstable_cache fungerar inte i skript utanför Next.

const HOUR = 3600;

export const getStatsCached = unstable_cache(getStats, ["catalogue-stats"], { tags: [TAG], revalidate: HOUR });
export const getSuppliersCached = unstable_cache(getSuppliers, ["catalogue-suppliers"], { tags: [TAG], revalidate: HOUR });
export const getListsCached = unstable_cache(getLists, ["catalogue-lists"], { tags: [TAG], revalidate: HOUR });
export const getSourcesCached = unstable_cache(getSources, ["catalogue-sources"], { tags: [TAG], revalidate: HOUR });
export const getSourceCached = unstable_cache(getSource, ["catalogue-source"], { tags: [TAG], revalidate: HOUR });

// Adminens sidomeny räknar tungt över alla källor. Korta tider räcker, och en ändring rensar den direkt.
export const adminNavCountsCached = unstable_cache(adminNavCounts, ["admin-nav-counts"], { tags: [TAG], revalidate: 30 });
