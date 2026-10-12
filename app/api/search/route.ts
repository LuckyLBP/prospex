import { NextRequest, NextResponse } from "next/server";
import { getAccessOrNull } from "@/lib/auth";
import { checkRate } from "@/lib/access/meter";
import { LIMIT_MESSAGE } from "@/lib/access/limits";
import { globalSearch } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Sökrutan i sidhuvudet. Högst 20 sökningar i minuten per användare, och svaret har aldrig telefon eller org.nr. */
export async function GET(req: NextRequest) {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  const rate = await checkRate({ userId: a.user.id, orgId: a.org.id, isAdmin: a.isAdmin }, "search");
  if (!rate.ok) return NextResponse.json({ error: "limit", message: LIMIT_MESSAGE.minute }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
  return NextResponse.json({ results: await globalSearch(q, 8) });
}
