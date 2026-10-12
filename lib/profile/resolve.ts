import { BolagsverketError, getOrganisation, isBolagsverketConfigured, isBolagsverketTest } from "@/lib/bolagsverket/client";
import type { CompanyRegistry } from "@/lib/bolagsverket/types";
import { findCompanyByDomain, findCompanyByOrgnr, type CatalogCompany } from "@/lib/companies/upsert";
import type { ProfileInput } from "./input";
import { findWebsiteByName, isPlacesConfigured, type PlaceHit } from "./places";

// Från det någon skrev till ett företag och, om det går, dess webbplats. Katalogen först, sedan Bolagsverket för
// namn och ort, och sist Google Places (ett anrop). Allt är injicerbart så att varje gren går att testa.

export type WebsiteSource = "input" | "catalog" | "places" | "none";

export interface Resolved {
  kind: "url" | "orgnr";
  /** Hela numret, bara i minnet. Aldrig för sparande när `soleTrader`. */
  orgnr: string | null;
  orgnrDisplay: string | null;
  soleTrader: boolean;
  domain: string | null;
  websiteSource: WebsiteSource;
  /** Sant när webbplatsen kommer från användaren eller från katalogen. En träff från Places är bara trolig. */
  websiteVerified: boolean;
  catalog: CatalogCompany | null;
  organisation: CompanyRegistry | null;
  place: PlaceHit | null;
  name: string | null;
  city: string | null;
  warnings: string[];
}

export interface ResolveDeps {
  findCompanyByOrgnr: typeof findCompanyByOrgnr;
  findCompanyByDomain: typeof findCompanyByDomain;
  getOrganisation: typeof getOrganisation;
  findWebsiteByName: typeof findWebsiteByName;
  bolagsverket: { configured: boolean; test: boolean };
  placesConfigured: boolean;
}

export const defaultResolveDeps = (): ResolveDeps => ({
  findCompanyByOrgnr, findCompanyByDomain, getOrganisation, findWebsiteByName,
  bolagsverket: { configured: isBolagsverketConfigured(), test: isBolagsverketTest() },
  placesConfigured: isPlacesConfigured(),
});

type Parsed = Extract<ProfileInput, { kind: "orgnr" | "url" }>;

export async function resolveInput(input: Parsed, deps: ResolveDeps = defaultResolveDeps()): Promise<Resolved> {
  const out: Resolved = {
    kind: input.kind, orgnr: null, orgnrDisplay: null, soleTrader: false, domain: null, websiteSource: "none", websiteVerified: false,
    catalog: null, organisation: null, place: null, name: null, city: null, warnings: [],
  };

  if (input.kind === "url") {
    out.domain = input.domain;
    out.websiteSource = "input";
    out.websiteVerified = true;
    out.catalog = await deps.findCompanyByDomain(input.domain);
    if (out.catalog) {
      out.name = out.catalog.name;
      if (out.catalog.orgnr) {
        out.orgnr = out.catalog.orgnr;
        out.orgnrDisplay = out.catalog.orgnr;
      }
    }
    return out;
  }

  out.orgnr = input.orgnr;
  out.orgnrDisplay = input.display;
  out.soleTrader = input.soleTrader;

  // Katalogen har aldrig en enskild firmas nummer, så där finns inget att slå upp.
  if (!input.soleTrader) {
    out.catalog = await deps.findCompanyByOrgnr(input.orgnr);
    if (out.catalog) {
      out.name = out.catalog.name;
      if (out.catalog.domain) {
        out.domain = out.catalog.domain;
        out.websiteSource = "catalog";
        out.websiteVerified = true;
        return out;
      }
    }
  }

  if (!deps.bolagsverket.configured) out.warnings.push("Bolagsverket är inte konfigurerat, så namn och ort saknas och webbplatsen går inte att leta upp.");
  else if (deps.bolagsverket.test) out.warnings.push("Bolagsverket är i testläge och känner inte igen riktiga organisationsnummer.");
  else {
    try {
      out.organisation = await deps.getOrganisation(input.orgnr);
    } catch (e) {
      out.warnings.push(e instanceof BolagsverketError && e.temporary ? "Bolagsverket svarade inte just nu." : "Bolagsverket kunde inte nås.");
    }
    if (!out.organisation && !out.warnings.some((w) => w.startsWith("Bolagsverket"))) out.warnings.push("Organisationsnumret hittades inte hos Bolagsverket.");
  }
  out.name = out.organisation?.name ?? out.name;
  out.city = out.organisation?.address?.city ?? null;

  if (!out.name) return out;
  if (!deps.placesConfigured) {
    out.warnings.push("Google Places är inte konfigurerat, så webbplatsen kunde inte letas upp.");
    return out;
  }
  const place = await deps.findWebsiteByName(out.name, out.city);
  if (!place) {
    out.warnings.push("Ingen webbplats hittades för företaget.");
    return out;
  }
  out.place = place;
  if (place.domain) {
    out.domain = place.domain;
    out.websiteSource = "places";
    out.websiteVerified = false;
    out.warnings.push(`Webbplatsen ${place.domain} hittades via Google Places och är inte bekräftad, eftersom företagets org.nr inte har setts på den.`);
  } else {
    out.warnings.push("Företaget finns på Google men anger ingen webbplats.");
  }
  return out;
}
