import { pool } from "@/lib/db";

// Dygnets förbrukning av betalda källor för byråer. Tak på båda, så att en omgång profiler eller en stor byrå inte kan
// tömma OpenSEO-krediterna eller ge en Claude-räkning över natten. Läses ur körningarna (scrape_runs), som varje
// byråkörning skriver sin förbrukning till. Utan kolumnerna (migrationen inte körd) är förbrukningen noll.

/** OpenSEO-krediter per dygn, alla byråer. */
export const DAILY_CREDIT_CAP = 1200;
/** Claude-kronor per dygn, alla byråer. */
export const DAILY_CLAUDE_SEK_CAP = 50;

export interface Spend {
  credits: number;
  costSek: number;
}

/** Förbrukningen de senaste 24 timmarna. Noll när den inte går att läsa. */
export async function spendLast24h(): Promise<Spend> {
  try {
    const { rows } = await pool.query(
      `select coalesce(sum(r.credits_used), 0)::int as credits, coalesce(sum(r.cost_sek), 0)::float as cost
       from scrape_runs r join suppliers s on s.id = r.supplier_id
       where s.method = 'agency' and r.created_at > now() - interval '24 hours'`,
    );
    return { credits: rows[0].credits as number, costSek: rows[0].cost as number };
  } catch {
    return { credits: 0, costSek: 0 };
  }
}

export const creditsLeftToday = (s: Spend): number => Math.max(0, DAILY_CREDIT_CAP - s.credits);
export const claudeAllowed = (s: Spend): boolean => s.costSek < DAILY_CLAUDE_SEK_CAP;
export const overDailyCap = (s: Spend): boolean => s.credits >= DAILY_CREDIT_CAP || s.costSek >= DAILY_CLAUDE_SEK_CAP;
