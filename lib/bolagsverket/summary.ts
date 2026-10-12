import { companyStatus, type CompanyStatus, type RegistryData } from "./types";

/** Det lilla av Bolagsverket-uppgifterna som visas utan att kortet öppnas. */
export interface RegistrySummary {
  legalForm: string | null;
  sni: string | null;
  status: CompanyStatus;
}

/** Ur kolumnen `registry`. Ingen server-only: formen är ren data. */
export function summariseRegistry(value: unknown): RegistrySummary | null {
  const data = value as Partial<RegistryData> | null;
  const organisation = data?.version === 1 ? data.organisation : null;
  if (!organisation) return null;
  return {
    legalForm: organisation.legalForm?.label ?? null,
    sni: organisation.sni[0]?.label ?? null,
    status: companyStatus(organisation),
  };
}
