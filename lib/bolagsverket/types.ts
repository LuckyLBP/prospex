/**
 * Det appen sparar om ett företag från Bolagsverkets API för värdefulla
 * datamängder, i `scrape_records.registry`. Egen form och inte API:ets svar
 * rakt av: svaret är djupt nästlat, bär en felruta per uppgift, och den som
 * läser kolumnen ska inte behöva känna till det.
 */

export interface CodeLabel {
  code: string;
  label: string;
}

export interface CompanyRegistry {
  orgnr: string;
  name: string | null;
  /** Särskilda företagsnamn och namn på främmande språk. */
  otherNames: string[];
  /** Bolagsverkets organisationsform: Aktiebolag, Handelsbolag … */
  legalForm: CodeLabel | null;
  registeredAt: string | null;
  /** SCB:s "verksam organisation". null när uppgiften inte gick att hämta. */
  active: boolean | null;
  deregisteredAt: string | null;
  deregistrationReason: string | null;
  /** Pågående konkurs, likvidation, rekonstruktion … */
  proceedings: { label: string; from: string | null }[];
  description: string | null;
  sni: CodeLabel[];
  address: { street: string | null; postalCode: string; city: string | null; co: string | null } | null;
  /** SCB:s reklamspärr: företaget har bett att slippa adresserad reklam. */
  advertisingBlocked: boolean | null;
  /** Uppgifter som inte gick att hämta från en av källorna. */
  unavailable: string[];
}

/** Ett räkenskapsårs viktigaste tal. */
export interface YearFigures {
  /** Räkenskapsårets sista dag. */
  periodEnd: string;
  revenue: number | null;
  profit: number | null;
  employees: number | null;
  equity: number | null;
}

export interface AnnualFigures extends YearFigures {
  registeredAt: string | null;
  totalAssets: number | null;
  /** Procent, 0–100. */
  solidity: number | null;
  operatingProfit?: number | null;
  /** Året före, ur samma fil. Saknas (undefined) i uppgifter som sparades innan det lästes. */
  previous?: YearFigures | null;
  /** Äldre år, nyast först, ur de äldre årsredovisningarna. */
  history?: YearFigures[];
}

/** Det som ligger i kolumnen `registry`. */
export interface RegistryData {
  version: 1;
  /** null när Bolagsverket inte känner till numret. */
  organisation: CompanyRegistry | null;
  organisationFetchedAt: string;
  /** Saknas = aldrig hämtat. null = hämtat, men ingen digital årsredovisning finns. */
  annualReport?: AnnualFigures | null;
  annualReportFetchedAt?: string;
}

/** Vad kortet visar i sin statusrad. */
export type CompanyStatus =
  | { kind: "active" }
  | { kind: "deregistered"; date: string | null; reason: string | null }
  | { kind: "proceeding"; label: string; from: string | null }
  | { kind: "inactive" }
  | { kind: "unknown" };

export function companyStatus(company: CompanyRegistry): CompanyStatus {
  if (company.deregisteredAt) {
    return { kind: "deregistered", date: company.deregisteredAt, reason: company.deregistrationReason };
  }
  const proceeding = company.proceedings[0];
  if (proceeding) return { kind: "proceeding", label: proceeding.label, from: proceeding.from };
  if (company.active === false) return { kind: "inactive" };
  if (company.active === true) return { kind: "active" };
  return { kind: "unknown" };
}
