import { pool } from "@/lib/db";

// Det hårda taket för Brave Search: planen räcker till ett visst antal anrop, och ett anrop som gjorts kan inte tas
// tillbaka. Varje anrop reserverar därför en plats i databasen FÖRE anropet, i ett enda atomärt uttryck, så att två
// körningar samtidigt aldrig kan passera taket. Räknaren är en rad i search_usage (migration 0030) och nollställs inte
// av sig själv. Höj taket med BRAVE_SEARCH_LIMIT när planen förnyas, eller nollställ raden.

export const SEARCH_PROVIDER = "brave";
export const DEFAULT_SEARCH_LIMIT = 1000;

export const searchLimit = (): number => {
  const n = Number(process.env.BRAVE_SEARCH_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SEARCH_LIMIT;
};

/**
 * Reserverar ett anrop. True = det finns plats och räknaren är uppräknad, false = taket är nått. Ett fel (till exempel
 * att tabellen saknas) räknas också som nej: hellre inget anrop än ett utan koll.
 */
export async function reserveSearchQuery(limit = searchLimit()): Promise<boolean> {
  try {
    const r = await pool.query(
      `insert into search_usage (provider, used) values ($1, 1)
       on conflict (provider) do update set used = search_usage.used + 1, updated_at = now()
       where search_usage.used < $2
       returning used`,
      [SEARCH_PROVIDER, limit],
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Hur många anrop som gjorts hittills, eller null när det inte går att läsa. */
export async function searchUsed(): Promise<number | null> {
  try {
    const r = await pool.query(`select used from search_usage where provider = $1`, [SEARCH_PROVIDER]);
    return (r.rows[0]?.used as number | undefined) ?? 0;
  } catch {
    return null;
  }
}
