import { pool } from "@/lib/db";

// Hårda månadstak för betalda söktjänster. Varje tjänst har en plan som räcker till ett visst antal anrop, och ett anrop
// som gjorts kan inte tas tillbaka. Därför reserverar varje anrop en plats i databasen FÖRE anropet, i ett enda atomärt
// uttryck, så att två körningar samtidigt aldrig kan passera taket. Räknaren är en rad per tjänst och kalendermånad i
// search_usage (migration 0030), med månaden i nyckeln ("brave:2026-11"), så en ny månad börjar på noll av sig själv.
// Planens månad antas följa kalendermånaden (UTC).

export const SEARCH_PROVIDER = "brave";
export const DEFAULT_SEARCH_LIMIT = 1000;
export const SWC_PROVIDER = "searchwebcode";
/** SearchWebCode kostar cirka 0,05 USD per sökning: 300 i månaden är cirka 15 USD. Höj med SEARCHWEBCODE_MONTHLY_LIMIT. */
export const DEFAULT_SWC_LIMIT = 300;

/** Räknarens nyckel för månaden: "brave:2026-11". Ren. */
export const usageKey = (now: Date = new Date(), provider: string = SEARCH_PROVIDER): string => `${provider}:${now.toISOString().slice(0, 7)}`;

const limitFrom = (env: string | undefined, fallback: number): number => {
  const n = Number(env);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const searchLimit = (): number => limitFrom(process.env.BRAVE_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT);
export const swcLimit = (): number => limitFrom(process.env.SEARCHWEBCODE_MONTHLY_LIMIT, DEFAULT_SWC_LIMIT);

/**
 * Reserverar ett anrop hos en tjänst. True = det finns plats och räknaren är uppräknad, false = taket är nått. Ett fel
 * (till exempel att tabellen saknas) räknas också som nej: hellre inget anrop än ett utan koll.
 */
export async function reserveQuery(provider: string, limit: number, now: Date = new Date()): Promise<boolean> {
  try {
    const r = await pool.query(
      `insert into search_usage (provider, used) values ($1, 1)
       on conflict (provider) do update set used = search_usage.used + 1, updated_at = now()
       where search_usage.used < $2
       returning used`,
      [usageKey(now, provider), limit],
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export const reserveSearchQuery = (limit = searchLimit(), now: Date = new Date()): Promise<boolean> => reserveQuery(SEARCH_PROVIDER, limit, now);
export const reserveSwcSearch = (limit = swcLimit(), now: Date = new Date()): Promise<boolean> => reserveQuery(SWC_PROVIDER, limit, now);

/** Hur många anrop som gjorts den här månaden hos en tjänst, eller null när det inte går att läsa. */
export async function usedThisMonth(provider: string = SEARCH_PROVIDER): Promise<number | null> {
  try {
    const r = await pool.query(`select used from search_usage where provider = $1`, [usageKey(new Date(), provider)]);
    return (r.rows[0]?.used as number | undefined) ?? 0;
  } catch {
    return null;
  }
}

/** Behålls för äldre anrop: Brave-räknaren. */
export const searchUsed = (): Promise<number | null> => usedThisMonth(SEARCH_PROVIDER);
