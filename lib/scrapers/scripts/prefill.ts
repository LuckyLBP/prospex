/**
 * Is this item already complete enough to skip a website visit?
 *
 * `prefilled` on a CollectedItem means "mark it enriched on insert", so this
 * is what decides whether an imported row costs an HTTP request later. Two
 * cases, and both are about not spending a request that cannot pay for itself:
 *
 *   - no domain: there is nothing to visit.
 *   - email AND phone already known: a visit could only confirm them.
 *
 * A row with a domain but only one of the two is left queued, because the
 * visit is the only way the missing half will ever arrive.
 *
 * The profile's `enrich_sites` flag still overrides all of this: a profile
 * with enrichment switched off never queues anything.
 */
export function shouldSkipEnrichment(item: {
  domain: string | null;
  email: string | null;
  phone: string | null;
}): boolean {
  if (!item.domain) return true;
  return Boolean(item.email && item.phone);
}
