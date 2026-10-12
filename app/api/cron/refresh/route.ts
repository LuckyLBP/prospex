import { timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";
import { resolveBaseUrl } from "@/lib/runs/trigger";
import { pickDueProfiles, type ScheduleCandidate } from "@/lib/runs/schedule";
import { lastCollectBySupplier, sweepStaleRuns } from "@/lib/runs/store";
import { triggerRun } from "@/lib/runs/start";
import { RunStartError } from "@/lib/runs/errors";

/**
 * Uppdateringen, anropad av Vercel Cron en gång om dagen (vercel.json). Startar de publicerade källor som
 * står på tur (lib/runs/schedule.ts) och lämnar över var och en till samma arbetare som ett klick i admin.
 * Svarar när körningarna är STARTADE, inte klara.
 *
 * SKYDDAD AV CRON_SECRET (`Authorization: Bearer ...`). Utan den svarar routen 401 på allt, så en glömd
 * variabel ger ett synligt fel i cronloggen och inte en öppen endpoint.
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

  const swept = await sweepStaleRuns();
  const [{ rows }, last] = await Promise.all([
    pool.query(`select id, method, published from suppliers where method is not null`),
    lastCollectBySupplier(),
  ]);
  const candidates: ScheduleCandidate[] = rows.map((s) => ({ profileId: s.id, method: s.method, published: s.published, lastCollectAt: last.get(s.id) ?? null }));
  const due = pickDueProfiles(candidates);

  // Inte förfrågans egen adress: Vercel Cron anropar deploy-URL:en, som deployment protection vaktar (se trigger.ts).
  const baseUrl = await resolveBaseUrl();
  const started: string[] = [];
  const skipped: { profileId: string; reason: string }[] = [];
  for (const p of due) {
    try {
      await triggerRun(p.profileId, { baseUrl });
      started.push(p.profileId);
    } catch (e) {
      skipped.push({ profileId: p.profileId, reason: e instanceof RunStartError ? e.message : "arbetaren svarade inte" });
    }
  }
  return Response.json({ swept, due: due.length, started, skipped });
}
