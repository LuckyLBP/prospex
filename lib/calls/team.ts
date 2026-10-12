import type { CallOutcome } from "./outcomes";

/**
 * Teamets siffror, ur samtalsloggen. Ren funktion: loggrader in, rader per
 * säljare och per källa ut -- frågan bor i team-stats.ts.
 *
 * NÅDD betyder att någon svarade: allt utom Ej svar, Upptaget, Fel nummer och
 * Ringer ej numret (där ringde säljaren aldrig).
 * Det är nämnaren som säger om en källa är värd att ringa -- en källa där
 * hälften av numren är fel kostar lika mycket tid som den ger samtal.
 */
const NOT_REACHED: ReadonlySet<CallOutcome> = new Set(["no_answer", "busy", "wrong_number", "skip_number"]);

export interface TeamCall {
  recordId: string;
  userId: string;
  userEmail: string;
  outcome: CallOutcome;
  profileId: string | null;
}

export interface Tally {
  calls: number;
  /** Olika företag, inte samtal: tre försök på samma nummer är ett företag. */
  companies: number;
  reached: number;
  meetings: number;
  customers: number;
}

export interface SellerTally extends Tally {
  userId: string;
  email: string;
}

export interface SourceTally extends Tally {
  profileId: string;
}

export interface TeamStats {
  total: Tally;
  sellers: SellerTally[];
  sources: SourceTally[];
}

class Counter {
  calls = 0;
  reached = 0;
  meetings = 0;
  customers = 0;
  records = new Set<string>();

  add(call: TeamCall) {
    this.calls++;
    this.records.add(call.recordId);
    if (!NOT_REACHED.has(call.outcome)) this.reached++;
    if (call.outcome === "meeting_booked") this.meetings++;
    if (call.outcome === "customer") this.customers++;
  }

  tally(): Tally {
    return {
      calls: this.calls,
      companies: this.records.size,
      reached: this.reached,
      meetings: this.meetings,
      customers: this.customers,
    };
  }
}

/** Mest möten först; samma antal möten avgörs av antalet samtal. */
function byResult(a: Tally, b: Tally): number {
  return b.meetings - a.meetings || b.customers - a.customers || b.calls - a.calls;
}

export function aggregateTeam(calls: readonly TeamCall[]): TeamStats {
  const total = new Counter();
  const sellers = new Map<string, { email: string; counter: Counter }>();
  const sources = new Map<string, Counter>();

  for (const call of calls) {
    total.add(call);

    const seller = sellers.get(call.userId) ?? { email: call.userEmail, counter: new Counter() };
    seller.counter.add(call);
    sellers.set(call.userId, seller);

    if (call.profileId) {
      const source = sources.get(call.profileId) ?? new Counter();
      source.add(call);
      sources.set(call.profileId, source);
    }
  }

  return {
    total: total.tally(),
    sellers: [...sellers]
      .map(([userId, { email, counter }]) => ({ userId, email, ...counter.tally() }))
      .sort(byResult),
    sources: [...sources]
      .map(([profileId, counter]) => ({ profileId, ...counter.tally() }))
      .sort(byResult),
  };
}

/** "12 %", eller ett streck när det inte finns något att dela med. */
export function formatRate(part: number, whole: number): string {
  if (whole === 0) return "–";
  return `${Math.round((part / whole) * 100)} %`;
}

export const TEAM_PERIODS = [7, 30, 90] as const;
export type TeamPeriod = (typeof TEAM_PERIODS)[number];

export function parseTeamPeriod(value: string | null | undefined): TeamPeriod {
  const days = Number(value);
  return (TEAM_PERIODS as readonly number[]).includes(days) ? (days as TeamPeriod) : 30;
}
