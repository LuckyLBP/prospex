import { pool } from "../db";
import { BolagsverketError, getAnnualFigures, getOrganisation, isBolagsverketTest } from "./client";
import type { RegistryData } from "./types";

/** Registeruppgifter hålls i en vecka innan kortet frågar igen. */
export const ORGANISATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Årsredovisningar kommer en gång om året; en månad räcker gott. */
export const FIGURES_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Kolumnens innehåll, om det är i den form appen skrev. */
export function readRegistry(value: unknown): RegistryData | null {
  const data = value as Partial<RegistryData> | null;
  return data && data.version === 1 && typeof data.organisationFetchedAt === "string" ? (data as RegistryData) : null;
}

export function isFresh(at: string | undefined, ttl: number, now: number): boolean {
  return Boolean(at) && now - new Date(at!).getTime() < ttl;
}

/**
 * Hämtar det som saknas eller blivit gammalt och sparar det på företaget (katalogen är gemensam, så
 * uppgifterna är en cache som alla bolag delar).
 *
 * `withFigures` hämtar också årsredovisningens nyckeltal: tre anrop och en filnedladdning, så bara när
 * någon öppnat företagsuppgifterna. I testmiljön hämtas uppgifterna men sparas inte, eftersom den
 * svarar fel på alla riktiga org.nr (se isBolagsverketTest).
 */
export async function refreshRegistry(
  company: { id: string; orgnr: string; registry: unknown },
  options: { withFigures: boolean; now?: number },
): Promise<RegistryData> {
  const now = options.now ?? Date.now();
  const existing = readRegistry(company.registry);

  let next: RegistryData | null = existing;
  let changed = false;

  if (!existing || !isFresh(existing.organisationFetchedAt, ORGANISATION_TTL_MS, now)) {
    next = {
      ...(existing ?? {}),
      version: 1,
      organisation: await getOrganisation(company.orgnr),
      organisationFetchedAt: new Date(now).toISOString(),
    };
    changed = true;
  }

  // Uppgifter som sparades innan året före lästes ur filen hämtas om, även om de inte är gamla.
  const oldFormat = next!.annualReport != null && next!.annualReport.previous === undefined;
  if (options.withFigures && next!.organisation && (oldFormat || !isFresh(next!.annualReportFetchedAt, FIGURES_TTL_MS, now))) {
    try {
      next = { ...next!, annualReport: await getAnnualFigures(company.orgnr), annualReportFetchedAt: new Date(now).toISOString() };
      changed = true;
    } catch (cause) {
      // Registeruppgifterna är värda att visa även när årsredovisningen inte gick att hämta; ett
      // konfigurationsfel ska däremot synas.
      if (!(cause instanceof BolagsverketError) || !cause.temporary) throw cause;
    }
  }

  if (changed && !isBolagsverketTest()) {
    await pool.query(`update companies set registry = $2::jsonb, registry_checked_at = $3 where id = $1`, [
      company.id,
      JSON.stringify(next),
      new Date(now).toISOString(),
    ]);
  }
  return next!;
}
