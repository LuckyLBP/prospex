import { postInternal } from "@/lib/runs/trigger";

/**
 * Startar bygget av en profil: ett internt anrop till /api/profiles/[id]/build, som svarar 202 och arbetar vidare.
 * `orgnr` skickas bara för en enskild firma vid första bygget, eftersom numret aldrig sparas: det följer med
 * anropet (inom vår egen app, skyddat av hemligheten) och används i minnet.
 */
export async function triggerProfileBuild(id: string, opts: { orgnr?: string | null; baseUrl?: string } = {}): Promise<void> {
  await postInternal(`/api/profiles/${id}/build`, { orgnr: opts.orgnr ?? null }, opts.baseUrl);
}
