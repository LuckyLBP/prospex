import { describe, expect, it } from "vitest";
import { decide } from "./ratelimit";

describe("decide(send)", () => {
  it("allows the first request", () => {
    expect(decide("send", { sinceLastSec: null, emailInWindow: 0, ipInWindow: 0 })).toEqual({ ok: true });
  });
  it("makes you wait out the 30 second cooldown, and says how long", () => {
    expect(decide("send", { sinceLastSec: 10, emailInWindow: 1, ipInWindow: 1 })).toEqual({ ok: false, retryAfterSec: 20 });
  });
  it("allows a new code after the cooldown", () => {
    expect(decide("send", { sinceLastSec: 31, emailInWindow: 1, ipInWindow: 1 })).toEqual({ ok: true });
  });
  it("blocks the ninth code within the hour, and says when the oldest one expires", () => {
    expect(decide("send", { sinceLastSec: 120, emailInWindow: 8, ipInWindow: 8, emailOldestSec: 3000 })).toEqual({ ok: false, retryAfterSec: 600 });
  });
  it("blocks an IP that tries many addresses, with the IP's own wait", () => {
    expect(decide("send", { sinceLastSec: null, emailInWindow: 0, ipInWindow: 30, ipOldestSec: 3500 })).toEqual({ ok: false, retryAfterSec: 100 });
  });
  it("never says zero seconds", () => {
    expect(decide("send", { sinceLastSec: 99, emailInWindow: 8, ipInWindow: 8, emailOldestSec: 3600 })).toEqual({ ok: false, retryAfterSec: 1 });
  });
});

describe("decide(verify)", () => {
  it("has no cooldown between checks", () => {
    expect(decide("verify", { sinceLastSec: 1, emailInWindow: 3, ipInWindow: 3 })).toEqual({ ok: true });
  });
  it("blocks the eleventh check in fifteen minutes, so a code cannot be guessed", () => {
    expect(decide("verify", { sinceLastSec: 1, emailInWindow: 10, ipInWindow: 10, emailOldestSec: 100 })).toEqual({ ok: false, retryAfterSec: 800 });
  });
});

describe("decide(request)", () => {
  it("allows three requests per hour and address, then says how long to wait", () => {
    expect(decide("request", { sinceLastSec: 5, emailInWindow: 2, ipInWindow: 2 })).toEqual({ ok: true });
    expect(decide("request", { sinceLastSec: 5, emailInWindow: 3, ipInWindow: 3, emailOldestSec: 600 })).toEqual({ ok: false, retryAfterSec: 3000 });
  });
});
