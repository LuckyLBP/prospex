import { CollectorError } from "./types";
import { fromPublicwww, isSwcConfigured, searchSwc, defaultSwcDeps, type SwcDeps } from "./searchwebcode";
import { reserveSwcSearch } from "@/lib/agencies/search-usage";

// Källkodssökning: "vilka sajter har den här strängen i sin källkod". Görs hos SearchWebCode (betalt per sökning, med ett
// hårt månadstak). Frågorna skrivs som en fras ("fras" eller "fras" site:se) och översätts.

export interface CodeHit {
  domain: string;
  url: string | null;
}

export const CODE_SOURCE_NAME = "SearchWebCode";

/** Finns nyckeln? Utan den hoppar upptäckten över källkodssökningen utan att larma, eftersom den är ett tillägg. */
export const isCodeSearchConfigured = (swc: SwcDeps = defaultSwcDeps()): boolean => isSwcConfigured(swc);

export interface CodeSearchDeps {
  swc?: SwcDeps;
  /** Reserverar en sökning mot månadstaket. False = taket är nått. */
  reserve?: () => Promise<boolean>;
}

/**
 * En sökning i källkod. Ger domänerna (en per domän) och om fler fanns än vad som hämtades. Kastar CollectorError med ett
 * svenskt meddelande, också när månadstaket är nått eller nyckeln saknas.
 */
export async function searchCode(
  query: string,
  maxResults: number,
  ctx: { signal: AbortSignal; log: (message: string) => void },
  deps: CodeSearchDeps = {},
): Promise<{ hits: CodeHit[]; truncated: boolean }> {
  const swc = deps.swc ?? defaultSwcDeps();
  if (!isSwcConfigured(swc)) throw new CollectorError("SEARCHWEBCODE_API_KEY saknas i miljön.");
  if (!(await (deps.reserve ?? reserveSwcSearch)())) {
    throw new CollectorError("SearchWebCode: månadens tak för antal sökningar är nått. Höj SEARCHWEBCODE_MONTHLY_LIMIT eller vänta till nästa månad.");
  }
  ctx.log(`SearchWebCode: ${query} (max ${maxResults})`);
  const r = await searchSwc(fromPublicwww(query), maxResults, ctx, swc);
  return { hits: r.hits, truncated: r.truncated };
}
