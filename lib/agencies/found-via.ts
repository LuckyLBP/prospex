/** Hittades byrån via en server (en sajt utan kredit som låg på byråns server)? Läser det som ensureAgencySupplier sparar i källans inställningar. Ren. */
export function foundViaServer(config: unknown): { ip: string; sites: number } | null {
  if (!config || typeof config !== "object") return null;
  const c = config as Record<string, unknown>;
  if (c.foundVia !== "server" || typeof c.serverIp !== "string") return null;
  return { ip: c.serverIp, sites: typeof c.serverSites === "number" ? c.serverSites : 0 };
}
