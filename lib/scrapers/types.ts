export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ScrapeMethod = "publicwww" | "viewdns" | "script" | "domainlist" | "googleplaces" | "agency";

/** Den källa (leverantör eller lista) en körning samlar in åt. */
export interface ScrapeProfile {
  id: string;
  slug: string;
  name: string;
  method: ScrapeMethod;
  config: unknown;
  enrich_sites: boolean;
}

/**
 * One collected company, in the shape upsertItems (lib/runs/store.ts) reads.
 *
 * `dedupeKey` is what makes a re-run an update rather than a duplicate: the
 * normalised domain where there is one, and "<source>:<id>" where there is
 * not. Every other field is optional because the collectors differ in how
 * much they know -- PublicWWW returns a bare domain, the table-sync scripts
 * return a whole company -- and the upsert never overwrites a known value
 * with a null one.
 */
export interface CollectedItem {
  dedupeKey: string;
  domain: string | null;
  website?: string | null;
  sourceUrl?: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  orgnr?: string | null;
  raw?: Record<string, unknown> | null;
  /** Arrived complete: mark it enriched on insert instead of queueing a fetch. */
  prefilled?: boolean;
}

/**
 * One chunk of a collection pass, plus where to resume.
 *
 * A run can outlive its serverless invocation, so a collector yields batches
 * and says how to continue rather than returning everything at once. `cursor`
 * null means "that was the last batch"; anything else is handed straight back
 * on the next invocation.
 */
export interface CollectBatch {
  items: CollectedItem[];
  cursor: Json | null;
  /** The source cut the result list short (a plan cap, not an error). */
  truncated?: boolean;
  /** Vad omgången kostade: OpenSEO-krediter och kronor (Claude m.m.). Summeras på körningen. */
  usage?: { credits?: number; costSek?: number };
  /** Vad omgången kontrollerade, för körningens sammanfattning. Summeras på körningen. */
  stats?: { checked: number; accepted: number; rejected: Record<string, number> };
  /** Something the run did without, in plain Swedish, shown in the run panel (for example a source that was skipped). */
  note?: string;
}

export interface CollectContext {
  profile: ScrapeProfile;
  runId: string;
  /** What the previous invocation left in scrape_runs.cursor, or null. */
  cursor: Json | null;
  /** Times out the whole collection pass along with the invocation. */
  signal: AbortSignal;
  log: (message: string) => void;
}

/**
 * A collection method.
 *
 * Adding a fourth one is a new file plus a line in registry.ts. Nothing in
 * the worker, the pages or the database knows which methods exist.
 */
export interface Collector<TConfig> {
  method: ScrapeMethod;
  /** Throws CollectorError when a stored config no longer parses. */
  parseConfig: (raw: unknown) => TConfig;
  collect: (config: TConfig, ctx: CollectContext) => AsyncGenerator<CollectBatch>;
}

/**
 * An error whose message is shown to the user, in Swedish, as the run's
 * failure reason. Anything else that escapes a collector is a bug and is
 * reported as one.
 */
export class CollectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectorError";
  }
}
