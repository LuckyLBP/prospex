import { NextRequest, NextResponse } from "next/server";
import { getAccessOrNull } from "@/lib/auth";
import { claimCompany, releaseClaims } from "@/lib/dialer/queue";

export const dynamic = "force-dynamic";

// Route handler, inte server action: förnyelser ska inte vänta bakom ett samtal som loggas.
export async function POST(req: NextRequest) {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { companyId } = (await req.json().catch(() => ({}))) as { companyId?: string };
  if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const s = await claimCompany(a.org.id, a.user.id, companyId);
  return NextResponse.json({
    claimed: s.claimed, holder_email: s.holderEmail, last_called_at: s.lastCalledAt,
    last_called_by_email: s.lastCalledByEmail, call_status: s.callStatus,
  });
}

export async function DELETE() {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await releaseClaims(a.org.id, a.user.id);
  return NextResponse.json({ ok: true });
}
