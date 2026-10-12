import { NextResponse } from "next/server";
import { getAccessOrNull } from "@/lib/auth";
import { dueCallbacks } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Mina återringningar som är förfallna eller infaller i dag (högst 8). */
export async function GET() {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await dueCallbacks(a.org.id, a.user.id, 8);
  return NextResponse.json({
    count: rows.length,
    callbacks: rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, at: r.next_callback_at, hasTime: r.callback_has_time })),
  });
}
