import { websiteUrl } from "../domain";
import type { CollectBatch, CollectContext } from "../types";
import type { ScriptHandler } from "./index";

/**
 * Three real domains, run through the full enrichment path.
 *
 * Exists so the pipeline can be exercised end to end without spending a
 * PublicWWW request, and so the next person to add a script has a file to copy
 * that is short enough to read in one go.
 */
const DOMAINS = ["effektivmedia.nu", "iana.org", "example.com"];

export const exampleScript: ScriptHandler = {
  key: "example",

  async *collect(ctx: CollectContext): AsyncGenerator<CollectBatch> {
    ctx.log(`Exempel: ${DOMAINS.length} domäner`);
    yield {
      items: DOMAINS.map((domain) => ({
        dedupeKey: domain,
        domain,
        website: websiteUrl(domain),
        prefilled: false,
      })),
      cursor: null,
    };
  },
};
