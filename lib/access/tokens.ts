import { createHmac, timingSafeEqual } from "node:crypto";

// Ett företags id får bara användas för att hämta uppgifter om servern själv har delat ut det till just den användaren.
// Varje id i ringlägets kö följer med en signatur som bara gäller för användaren och för i dag och i går. Då går det inte
// att be om uppgifter om ett godtyckligt id, utan bara om dem som ligger i den egna kön.

const DAY_MS = 86_400_000;

function secret(): string {
  const s = process.env.ACCESS_TOKEN_SECRET || process.env.INTERNAL_RUN_SECRET;
  if (!s) throw new Error("ACCESS_TOKEN_SECRET eller INTERNAL_RUN_SECRET måste vara satt.");
  return s;
}

const mac = (userId: string, companyId: string, day: number) => createHmac("sha256", secret()).update(`${userId}:${companyId}:${day}`).digest("base64url").slice(0, 22);

export function signCompanyId(userId: string, companyId: string, now = Date.now()): string {
  return mac(userId, companyId, Math.floor(now / DAY_MS));
}

export function verifyCompanyToken(userId: string, companyId: string, token: string, now = Date.now()): boolean {
  const day = Math.floor(now / DAY_MS);
  const got = Buffer.from(token);
  return [day, day - 1].some((d) => {
    const want = Buffer.from(mac(userId, companyId, d));
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

/** "id.signatur" -> id, eller null när signaturen inte stämmer. */
export function openToken(userId: string, raw: string, now = Date.now()): string | null {
  const [id, token] = raw.split(".");
  return id && token && /^[0-9a-f-]{36}$/i.test(id) && verifyCompanyToken(userId, id, token, now) ? id : null;
}
