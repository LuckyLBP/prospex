import { timingSafeEqual } from "node:crypto";
import { runReminders } from "@/lib/reminders";
import { productionBaseUrl } from "@/lib/runs/trigger";

/**
 * Morgonpåminnelserna, anropade av Vercel Cron en gång om dagen (vercel.json). Mejlar dem som slagit på det i
 * Inställningar och har återringningar att ringa. SKYDDAD AV CRON_SECRET på samma sätt som /api/cron/refresh.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return new Response(null, { status: 401 });
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? productionBaseUrl() ?? new URL(request.url).origin).replace(/\/$/, "");
  const r = await runReminders(baseUrl);
  return Response.json(r);
}
