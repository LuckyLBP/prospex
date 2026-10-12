import { beforeAll, describe, expect, it } from "vitest";
import { openToken, signCompanyId, verifyCompanyToken } from "./tokens";

const U = "11111111-1111-1111-1111-111111111111";
const C = "22222222-2222-2222-2222-222222222222";
const NOW = Date.UTC(2026, 9, 12, 12);
beforeAll(() => { process.env.INTERNAL_RUN_SECRET = "test-secret"; });

describe("company id tokens", () => {
  it("accepts the user's own token today and tomorrow, but not after that", () => {
    const t = signCompanyId(U, C, NOW);
    expect(verifyCompanyToken(U, C, t, NOW)).toBe(true);
    expect(verifyCompanyToken(U, C, t, NOW + 86_400_000)).toBe(true);
    expect(verifyCompanyToken(U, C, t, NOW + 3 * 86_400_000)).toBe(false);
  });
  it("rejects another user, another company and a forged token", () => {
    const t = signCompanyId(U, C, NOW);
    expect(verifyCompanyToken("33333333-3333-3333-3333-333333333333", C, t, NOW)).toBe(false);
    expect(verifyCompanyToken(U, "44444444-4444-4444-4444-444444444444", t, NOW)).toBe(false);
    expect(verifyCompanyToken(U, C, "x".repeat(22), NOW)).toBe(false);
    expect(verifyCompanyToken(U, C, "", NOW)).toBe(false);
  });
  it("opens 'id.token' and refuses anything else", () => {
    const t = signCompanyId(U, C);
    expect(openToken(U, `${C}.${t}`)).toBe(C);
    expect(openToken(U, C)).toBeNull();
    expect(openToken(U, `${C}.bad`)).toBeNull();
    expect(openToken(U, `not-a-uuid.${t}`)).toBeNull();
  });
});
