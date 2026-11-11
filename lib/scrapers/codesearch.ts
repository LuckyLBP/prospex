import { CollectorError } from "./types";
import { searchPublicwww, type PublicwwwDeps } from "./publicwww";
import { fromPublicwww, isSwcConfigured, searchSwc, defaultSwcDeps, type SwcDeps } from "./searchwebcode";
import { reserveSwcSearch } from "@/lib/agencies/search-usage";

// Källkodssökning: "vilka sajter har den här strängen i sin källkod". SearchWebCode är standardkällan (betalt per
// sökning, med ett hårt månadstak). PublicWWW används bara när ingen SearchWebCode-nyckel finns. Frågorna skrivs i
// PublicWWW-syntax ("fras" eller "fras" site:se) och översätts.

export interface CodeHit {
  domain: string;
  url: string | null;
}

export type CodeSource = "searchwebcode" | "publicwww";

/** Vilken källa som används just nu, för loggar och anteckningar. */
export const codeSource = (swc: SwcDeps = defaultSwcDeps()): CodeSource => (isSwcConfigured(swc) ? "searchwebcode" : "publicwww");
export const codeSourceName = (swc?: SwcDeps): string => (codeSource(swc) === "searchwebcode" ? "SearchWebCode" : "PublicWWW");

export interface CodeSearchDeps {
  publicwww?: PublicwwwDeps;
  swc?: SwcDeps;
  /** Reserverar en sökning mot månadstaket. False = taket är nått. */
  reserve?: () => Promise<boolean>;
}

/**
 * En sökning i källkod. Ger domänerna (en per domän) och om fler fanns än vad som hämtades. Kastar CollectorError med ett
 * svenskt meddelande, också när månadstaket för SearchWebCode är nått.
 */
export async function searchCode(
  query: string,
  maxResults: number,
  ctx: { signal: AbortSignal; log: (message: string) => void },
  deps: CodeSearchDeps = {},
): Promise<{ hits: CodeHit[]; truncated: boolean; source: CodeSource }> {
  const swc = deps.swc ?? defaultSwcDeps();
  if (!isSwcConfigured(swc)) {
    const body = await searchPublicwww(query, maxResults, ctx, deps.publicwww);
    const hits = (body.results ?? []).map((r) => ({ domain: r.domain ?? r.url ?? "", url: r.url ?? null }));
    return { hits, truncated: body.truncated === true, source: "publicwww" };
  }
  if (!(await (deps.reserve ?? reserveSwcSearch)())) {
    throw new CollectorError("SearchWebCode: månadens tak för antal sökningar är nått. Höj SEARCHWEBCODE_MONTHLY_LIMIT eller vänta till nästa månad.");
  }
  ctx.log(`SearchWebCode: ${query} (max ${maxResults})`);
  const r = await searchSwc(fromPublicwww(query), maxResults, ctx, swc);
  return { hits: r.hits, truncated: r.truncated, source: "searchwebcode" };
}
