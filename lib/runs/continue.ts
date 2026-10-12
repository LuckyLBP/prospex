import { send } from "@vercel/queue";
import { triggerExecute } from "./trigger";

/** Ämnet arbetarens nästa omgång skickas på. Konsumenten: /api/queues/scrape-run. */
export const RUN_TOPIC = "scrape-run";

export interface ContinueMessage {
  runId: string;
  leaseToken: string;
}

/**
 * Lämnar över en körning till nästa omgång.
 *
 * GENOM KÖN, INTE GENOM ETT ANROP TILL OSS SJÄLVA. Arbetaren ringde förr upp
 * sin egen route för varje ny omgång, och Vercel svarar 508 Loop Detected när
 * en deploy anropar sig själv ungefär fem gånger i rad -- så varje källa som
 * behövde fler än fem omgångar (Wix, Divi, Addictive Media) dog mitt i
 * berikningen som "ingen aktivitet på 15 minuter". En leverans från Vercel
 * Queues är en ny anropskedja varje gång.
 *
 * Idempotent: nyckeln är körning + lease, så samma överlämning skickad två
 * gånger blir ett meddelande, och ett meddelande levererat två gånger hittar
 * leasen redan tagen (se executeRun).
 *
 * Lokalt finns ingen kö och ingen loopspärr; där går det som förut, över HTTP.
 */
export async function continueRun(runId: string, leaseToken: string, baseUrl?: string): Promise<void> {
  if (!process.env.VERCEL) {
    await triggerExecute(runId, leaseToken, baseUrl);
    return;
  }
  await send<ContinueMessage>(RUN_TOPIC, { runId, leaseToken }, { idempotencyKey: `${runId}:${leaseToken}` });
}
