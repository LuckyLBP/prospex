import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimWarning, parseClaim, skipReason } from "./claim";

const NOW = new Date("2026-10-05T10:00:00Z").getTime();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("parseClaim", () => {
  it("reads the RPC's snake_case answer", () => {
    expect(
      parseClaim({
        claimed: false,
        holder_email: "anna.berg@effektivmedia.nu",
        last_called_at: null,
        last_called_by_email: null,
        call_status: null,
      }),
    ).toEqual({
      claimed: false,
      holderEmail: "anna.berg@effektivmedia.nu",
      lastCalledAt: null,
      lastCalledByEmail: null,
      callStatus: null,
    });
  });

  it("treats a missing answer as claimed, so a hiccup never blocks a call", () => {
    expect(parseClaim(null).claimed).toBe(true);
  });
});

describe("claimWarning", () => {
  // formatRelative reads the clock itself.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("says who has the card open", () => {
    const status = parseClaim({ claimed: false, holder_email: "anna.berg@effektivmedia.nu" });
    expect(claimWarning(status, NOW)).toBe("Anna har det här företaget framför sig just nu.");
  });

  it("says who called recently, and what happened", () => {
    const status = parseClaim({
      claimed: true,
      last_called_at: minutesAgo(3),
      last_called_by_email: "erik@effektivmedia.nu",
      call_status: "not_interested",
    });
    expect(claimWarning(status, NOW)).toBe("Erik ringde för 3 min sedan: Ej intresserad.");
  });

  it("stays quiet about my own calls and about old ones", () => {
    expect(claimWarning(parseClaim({ claimed: true, last_called_at: minutesAgo(5) }), NOW)).toBeNull();
    expect(
      claimWarning(
        parseClaim({ claimed: true, last_called_at: minutesAgo(60 * 48), last_called_by_email: "erik@x.se" }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("skipReason", () => {
  const queueBuiltAt = NOW - 10 * 60_000;

  it("skips a card a colleague has open", () => {
    expect(skipReason(parseClaim({ claimed: false, holder_email: "anna@x.se" }), queueBuiltAt)).toBe("Anna har det öppet");
  });

  it("skips a card a colleague called after my queue was built", () => {
    const status = parseClaim({ claimed: true, last_called_at: minutesAgo(3), last_called_by_email: "erik@x.se" });
    expect(skipReason(status, queueBuiltAt)).toBe("Erik har redan ringt");
  });

  it("keeps an ordinary retry: called by a colleague before the queue was built", () => {
    const status = parseClaim({ claimed: true, last_called_at: minutesAgo(60 * 20), last_called_by_email: "erik@x.se" });
    expect(skipReason(status, queueBuiltAt)).toBeNull();
  });

  it("never skips on my own calls or before the answer has come", () => {
    expect(skipReason(parseClaim({ claimed: true, last_called_at: minutesAgo(1) }), queueBuiltAt)).toBeNull();
    expect(skipReason(null, queueBuiltAt)).toBeNull();
  });
});
