/**
 * Run an async mapper over a list, at most `limit` at a time.
 *
 * Enrichment is almost entirely waiting on other people's servers, so serial
 * fetching would spend a whole invocation on a handful of sites. A limit is
 * still needed: unbounded parallelism would open a hundred sockets, and being
 * a good citizen towards the sites being read is part of the deal.
 *
 * Results come back in input order regardless of completion order, so a caller
 * can zip them against the input.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const width = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
