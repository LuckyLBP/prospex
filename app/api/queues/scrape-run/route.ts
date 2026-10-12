import { handleCallback } from "@vercel/queue";
import { continueRun, type ContinueMessage } from "@/lib/runs/continue";
import { executeRun } from "@/lib/runs/worker";

/**
 * Arbetarens följande omgångar, levererade av Vercel Queues (vercel.json:
 * experimentalTriggers, ämnet "scrape-run"). Den första omgången startas
 * fortfarande av /api/runs/[id]/execute; varje fortsättning kommer hit, se
 * lib/runs/continue.ts för varför.
 *
 * Ingen hemlighet att pröva: routen nås bara av kötjänstens signerade
 * leveranser, som handleCallback kontrollerar.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const POST = handleCallback<ContinueMessage>(
  async ({ runId, leaseToken }) => {
    const result = await executeRun(runId, { expectedLease: leaseToken });
    if (result.kind === "continue") await continueRun(runId, result.leaseToken);
  },
  {
    // executeRun fångar sina egna fel och skriver dem på körningen; det som
    // kastas hit är att kön inte gick att nå. Tre försök, sedan släpps det --
    // körningen sveps då som tyst efter femton minuter, som förut.
    retry: (_error, metadata) => (metadata.deliveryCount >= 3 ? { acknowledge: true } : { afterSeconds: 30 }),
  },
);
