import { startRun, failRun, type Stage } from "./store";
import { triggerExecute } from "./trigger";

/**
 * Startar en körning och lämnar över den till arbetaren. Om arbetaren inte går att nå sätts körningen
 * direkt till fel, så att den inte blockerar källan i 15 minuter och ser ut som pågående arbete.
 */
export async function triggerRun(supplierId: string, opts: { stage?: Stage; triggeredBy?: string | null; baseUrl?: string } = {}): Promise<string> {
  const runId = await startRun(supplierId, opts);
  try {
    await triggerExecute(runId, null, opts.baseUrl);
  } catch (cause) {
    await failRun(runId, `Kunde inte starta bakgrundsjobbet: ${cause instanceof Error ? cause.message : "okänt fel"}`);
    throw cause;
  }
  return runId;
}
