import { after } from "next/server";
import { internalSecretMatches } from "@/lib/internal-secret";
import { executeRun } from "@/lib/runs/worker";
import { productionBaseUrl } from "@/lib/runs/trigger";
import { continueRun } from "@/lib/runs/continue";

/**
 * The run worker's front door.
 *
 * ANSWERS 202 AND THEN WORKS. after() runs its callback once the response has
 * been sent, with the invocation kept alive for it, which is what lets a
 * scrape take minutes while the button that started it returns immediately.
 *
 * maxDuration is the platform's ceiling on that: 300 seconds is the most a
 * Vercel Hobby function gets, and the worker budgets 200 of them so it always
 * has time to write down where it stopped and hand over to the next leg
 * (lib/runs/continue.ts -- through Vercel Queues, not back to this route).
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!internalSecretMatches(request.headers.get("x-internal-secret"))) {
    return new Response(null, { status: 401 });
  }

  const { id } = await context.params;
  const { origin } = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { leaseToken?: string | null };

  after(async () => {
    try {
      const result = await executeRun(id, { expectedLease: body.leaseToken ?? null });
      // Out of budget with work left: hand the lease to the next leg. On
      // Vercel that is a queue message; the origin is only used locally.
      if (result.kind === "continue") {
        await continueRun(id, result.leaseToken, productionBaseUrl() ?? origin);
      }
    } catch (cause) {
      // Nothing is listening for this response any more, so a log line is the
      // only way this failure is ever seen. The run row's own error is written
      // by the worker; a throw here means the chaining itself broke.
      console.error(`[run ${id}] körningen kunde inte fortsätta`, cause);
    }
  });

  return new Response(null, { status: 202 });
}
