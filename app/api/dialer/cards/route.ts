import { NextRequest, NextResponse } from "next/server";
import { getAccessOrNull } from "@/lib/auth";
import { getCards } from "@/lib/dialer/cards";
import { CARD_BATCH_MAX } from "@/lib/dialer/card-types";

export const dynamic = "force-dynamic";

/** Förhämtning av kort till ringläget. `?ids=a,b,c` (högst 12), alltid för den inloggades bolag. */
export async function GET(req: NextRequest) {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0 || ids.length > CARD_BATCH_MAX || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  return NextResponse.json({ cards: await getCards(a.org.id, ids) });
}
