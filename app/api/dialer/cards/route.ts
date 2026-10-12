import { NextRequest, NextResponse } from "next/server";
import { getAccessOrNull } from "@/lib/auth";
import { getCardsMetered } from "@/lib/access/release";
import { openToken } from "@/lib/access/tokens";
import { CARD_BATCH_MAX } from "@/lib/dialer/card-types";

export const dynamic = "force-dynamic";

/**
 * Förhämtning av kort till ringläget. `?ids=id.signatur,...` (högst 12). Ett id utan en signatur som servern själv
 * delat ut till den inloggade ger ingenting, så uppgifter går bara att hämta om företag i den egna kön. Gränserna
 * för hur många företag som släpps (per minut och per dygn) gäller här (lib/access).
 */
export async function GET(req: NextRequest) {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (raw.length === 0 || raw.length > CARD_BATCH_MAX) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const opened = raw.map((r) => openToken(a.user.id, r));
  if (opened.some((id) => !id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const r = await getCardsMetered({ userId: a.user.id, orgId: a.org.id, isAdmin: a.isAdmin }, opened as string[]);
  if (r.limited && r.cards.length === 0) return NextResponse.json({ error: "limit", reason: r.limited.reason, message: r.limited.message }, { status: 429 });
  return NextResponse.json({ cards: r.cards, limited: r.limited });
}
