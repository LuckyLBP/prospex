import { headers } from "next/headers";
import { pool } from "./db";

export type Kind = "send" | "verify";

/** Gränserna. `send`: en kod per 30 sekunder, åtta per timme per adress. `verify`: tio kontroller per kvart. */
export const LIMITS = {
  send: { cooldownSec: 30, emailWindowSec: 3600, emailMax: 8, ipWindowSec: 3600, ipMax: 30 },
  verify: { cooldownSec: 0, emailWindowSec: 900, emailMax: 10, ipWindowSec: 900, ipMax: 30 },
} as const;

export type Counts = {
  sinceLastSec: number | null;
  emailInWindow: number;
  ipInWindow: number;
  /** Hur länge sedan det äldsta försöket i fönstret gjordes. Det avgör när det går att försöka igen. */
  emailOldestSec?: number | null;
  ipOldestSec?: number | null;
};

const remaining = (window: number, oldest: number | null | undefined) =>
  Math.max(1, Math.ceil(window - (oldest ?? 0)));

/** Ren beslutsfunktion: ok, eller hur många sekunder man ska vänta. */
export function decide(kind: Kind, c: Counts): { ok: true } | { ok: false; retryAfterSec: number } {
  const l = LIMITS[kind];
  if (l.cooldownSec > 0 && c.sinceLastSec !== null && c.sinceLastSec < l.cooldownSec) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(l.cooldownSec - c.sinceLastSec)) };
  }
  if (c.emailInWindow >= l.emailMax) return { ok: false, retryAfterSec: remaining(l.emailWindowSec, c.emailOldestSec) };
  if (c.ipInWindow >= l.ipMax) return { ok: false, retryAfterSec: remaining(l.ipWindowSec, c.ipOldestSec) };
  return { ok: true };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 64);
}

/**
 * Räknar och registrerar ett försök i en transaktion. Ett rådgivande lås per adress gör att två
 * samtidiga förfrågningar inte båda slipper igenom. Avvisade försök registreras inte.
 */
export async function takeAttempt(kind: Kind, email: string, ip: string) {
  const l = LIMITS[kind];
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`${kind}:${email}`]);
    const { rows } = await client.query(
      `select
         extract(epoch from now() - max(created_at) filter (where email = $2)) as since_last,
         count(*) filter (where email = $2 and created_at > now() - make_interval(secs => $3))::int as email_n,
         extract(epoch from now() - min(created_at) filter (where email = $2 and created_at > now() - make_interval(secs => $3))) as email_oldest,
         count(*) filter (where ip = $4 and created_at > now() - make_interval(secs => $5))::int as ip_n,
         extract(epoch from now() - min(created_at) filter (where ip = $4 and created_at > now() - make_interval(secs => $5))) as ip_oldest
       from login_attempts where kind = $1 and (email = $2 or ip = $4) and created_at > now() - interval '1 day'`,
      [kind, email, l.emailWindowSec, ip, l.ipWindowSec],
    );
    const r = rows[0];
    const verdict = decide(kind, { sinceLastSec: r.since_last === null ? null : Number(r.since_last), emailInWindow: r.email_n, ipInWindow: r.ip_n,
      emailOldestSec: r.email_oldest === null ? null : Number(r.email_oldest), ipOldestSec: r.ip_oldest === null ? null : Number(r.ip_oldest) });
    if (verdict.ok) {
      await client.query(`insert into login_attempts (kind, email, ip) values ($1,$2,$3)`, [kind, email, ip]);
      await client.query(`delete from login_attempts where created_at < now() - interval '2 days'`);
    }
    await client.query("commit");
    return verdict;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
