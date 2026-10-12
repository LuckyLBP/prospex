import { NextRequest, NextResponse } from "next/server";
import { getAccessOrNull } from "@/lib/auth";
import { globalSearch } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await globalSearch(q, 8) });
}
