// Delas mellan server och klient -- ingen "server-only": routen tolkar
// RPC-svaret med parseClaim, och kortet räknar ut varningen med claimWarning.
import { outcomeLabel, type CallOutcome } from "@/lib/calls/outcomes";
import { firstNameFromEmail, formatRelative } from "@/lib/format";

/**
 * Vad scrape_claim_record svarade: fick jag posten, och om inte, vem har den.
 * Svaret bär också vem som ringde posten senast, eftersom kön byggdes när
 * sessionen började och ett samtal sedan dess inte syns på kortet.
 */
export interface ClaimStatus {
  claimed: boolean;
  holderEmail: string | null;
  lastCalledAt: string | null;
  /** Bara när någon ANNAN ringde senast. */
  lastCalledByEmail: string | null;
  callStatus: CallOutcome | null;
}

/**
 * Hur ofta ett öppet kort förnyar sin reservation. Reservationen gäller i fem
 * minuter (se migrationen), så två förnyelser hinner misslyckas innan den
 * löper ut.
 */
export const CLAIM_RENEW_MS = 2 * 60_000;

/** Ett samtal av någon annan så här nyligen är värt en varning. */
const RECENT_CALL_MS = 24 * 60 * 60_000;

export function parseClaim(value: unknown): ClaimStatus {
  const data = (value ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : null);
  return {
    claimed: data.claimed !== false,
    holderEmail: text("holder_email"),
    lastCalledAt: text("last_called_at"),
    lastCalledByEmail: text("last_called_by_email"),
    callStatus: text("call_status") as CallOutcome | null,
  };
}

function who(email: string | null): string {
  if (!email) return "En annan säljare";
  return firstNameFromEmail(email) ?? email;
}

/**
 * Varför ringläget ska gå förbi kortet utan att visa det, eller null.
 *
 * Kön byggdes när sessionen började. Har någon annan kortet framför sig, eller
 * ringt företaget SEDAN dess, är det inte längre mitt -- att visa det med en
 * varning var just det säljarna klagade på. Ett samtal från före kön byggdes
 * är däremot ett vanligt nytt försök (Ej svar i går) och hoppas inte över.
 */
export function skipReason(status: ClaimStatus | null, queueBuiltAt: number): string | null {
  if (!status) return null;
  if (!status.claimed) return `${who(status.holderEmail)} har det öppet`;
  if (
    status.lastCalledByEmail &&
    status.lastCalledAt &&
    new Date(status.lastCalledAt).getTime() > queueBuiltAt
  ) {
    return `${who(status.lastCalledByEmail)} har redan ringt`;
  }
  return null;
}

/**
 * Meningen ovanför kortet, eller null när det inte finns något att varna för.
 * Att någon annan har kortet öppet går först: det är det som betyder "ring
 * inte just nu".
 */
export function claimWarning(status: ClaimStatus | null, now: number = Date.now()): string | null {
  if (!status) return null;
  if (!status.claimed) return `${who(status.holderEmail)} har det här företaget framför sig just nu.`;
  if (
    status.lastCalledByEmail &&
    status.lastCalledAt &&
    now - new Date(status.lastCalledAt).getTime() < RECENT_CALL_MS
  ) {
    const outcome = status.callStatus ? `: ${outcomeLabel(status.callStatus)}` : "";
    return `${who(status.lastCalledByEmail)} ringde ${formatRelative(status.lastCalledAt)}${outcome}.`;
  }
  return null;
}
