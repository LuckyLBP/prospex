import type { AnnualFigures, CompanyRegistry } from "./types";

// Klientsäker: svaret från /api/companies/[id]/registry.
export type RegistryResponse =
  | { status: "ok"; organisation: CompanyRegistry | null; annualReport: AnnualFigures | null | undefined; fetchedAt: string; orgnr: string; test: boolean }
  | { status: "no_orgnr" }
  | { status: "error"; message: string; temporary: boolean };
