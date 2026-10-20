import { z } from "zod";

// Typer som delas mellan profilens moduler. Klientsäkra och utan beroenden utöver zod.

export type FactKind = "registry" | "detector" | "dns" | "header" | "audit" | "page" | "places" | "directory" | "jobs";

/** Ett belagt faktum. Varje påstående i en profil hänvisar till ett eller flera av dem med id. */
export interface Fact {
  id: string; // F1, F2, ...
  kind: FactKind;
  label: string;
  value: string;
  /** En adress, eller "Bolagsverket", "Google Places", "DNS". */
  source: string;
  detector?: string;
  /** Texten runt träffen, högst cirka 120 tecken. */
  match?: string;
}

export type TechCategory =
  | "analys" | "annonsering" | "säljverktyg" | "samtycke" | "marknadsautomation" | "e-post" | "chatt"
  | "e-handel" | "betalning" | "omdömen" | "widget" | "formulär" | "ramverk" | "cms" | "drift" | "bokning" | "domän";

export interface Detection {
  id: string;
  name: string;
  category: TechCategory;
  /** Ett kort tillägg, till exempel en version eller en lista. */
  detail?: string;
  match?: string;
}

export type Confidence = "stark" | "trolig" | "svag";
export type ServiceCategory = "webbplats" | "drift" | "annonsering" | "analys" | "e-post" | "bokning" | "e-handel" | "betalning" | "chatt" | "övrigt";

export interface ServiceItem {
  name: string;
  supplier: string | null;
  category: ServiceCategory;
  basis: string;
  confidence: Confidence;
  evidence: string[];
  origin: "regel" | "ai";
}

export const FACT_ID = /^F\d+$/;

export const Claim = z.object({
  text: z.string().max(400),
  evidence: z.array(z.string().regex(FACT_ID)).min(1).max(6),
});
export type Claim = z.infer<typeof Claim>;

/** Det modellen får skriva. Inga tal, inga kontaktuppgifter, och säkerheten får inte vara "stark". */
export const ProfileModelOutput = z.object({
  summary: z.string().max(700),
  offering: z.array(Claim).max(8),
  audience: Claim.nullable(),
  services: z
    .array(
      z.object({
        name: z.string().max(80),
        supplier: z.string().max(80).nullable(),
        category: z.enum(["webbplats", "drift", "annonsering", "analys", "e-post", "bokning", "e-handel", "betalning", "chatt", "övrigt"]),
        basis: z.string().max(300),
        confidence: z.enum(["trolig", "svag"]),
        evidence: z.array(z.string().regex(FACT_ID)).min(1).max(6),
      }),
    )
    .max(6),
  observations: z.array(Claim).max(6),
  /** Tre till fem korta, sakliga ingångar för säljaren. Tom lista när underlaget inte räcker. */
  talkingPoints: z.array(Claim).max(5).default([]),
});
export type ProfileModelOutput = z.infer<typeof ProfileModelOutput>;

// ---------------------------------------------------------------- sektionerna i en profil

import type { SiteAudit } from "@/lib/enrich/audit";
import type { AnnualFigures, CompanyRegistry } from "@/lib/bolagsverket/types";

export type RegistryStatus = "ok" | "not_configured" | "test" | "not_found" | "no_orgnr" | "error";
export type FiguresStatus = "ok" | "none_digital" | "not_fetched" | "not_applicable";

export interface RegistrySection {
  status: RegistryStatus;
  message: string | null;
  /** Bara det vi visar. För en enskild firma utan gatuadress och med maskat nummer. */
  organisation: Pick<CompanyRegistry, "orgnr" | "name" | "legalForm" | "registeredAt" | "active" | "deregisteredAt" | "deregistrationReason" | "proceedings" | "description" | "sni" | "advertisingBlocked"> & { address: { street: string | null; postalCode: string | null; city: string | null } | null } | null;
  figures: AnnualFigures | null;
  figuresStatus: FiguresStatus;
}

export type SiteStatus = "ok" | "none" | "blocked" | "unreachable" | "mismatch";

export interface SiteSection {
  status: SiteStatus;
  message: string | null;
  domain: string | null;
  url: string | null;
  audit: SiteAudit | null;
  tech: Detection[];
}

export interface PageLog {
  url: string;
  status: number;
  bytes: number;
  via: "code" | "model";
  problem: string | null;
}

export interface PageText {
  /** Id på sidans faktum (F7), som påståenden hänvisar till. */
  id: string;
  url: string;
  text: string;
}

// ---------------------------------------------------------------- hela profilen

import type { JobsSection } from "./jobs";
import type { Person } from "./people";
import type { SocialLink } from "./links";

export interface ProfileCreator {
  name: string;
  url: string | null;
  domain: string | null;
  logoPath: string | null;
  /** Byrån finns som källa i vår katalog. */
  supplierSlug: string | null;
  /** Hur kreditraden skrevs: "skapad av" (made-by) eller "powered by". Äldre profiler saknar det. */
  phrase?: "made-by" | "powered-by";
  /** Vad domänen bedömts vara och av vem. Bara "agency" får en egen källa och en kundsökning. Null = okänt. */
  kind?: "agency" | "platform" | "hosting" | "tool" | "not-agency" | null;
  kindSource?: "admin" | "saved" | "rule" | "ai" | null;
  /**
   * Varifrån byrån kommer: sidfoten (utelämnat eller "footer"), samma server eller namnserver som byråns kunder
   * ("same-server"), byråns egen kundlista i katalogen ("agency-source"), eller en gissning utifrån att sajten ligger på en
   * server vars andra sajter visar samma byrå i sidfoten ("server-guess").
   */
  basis?: "footer" | "same-server" | "agency-source" | "server-guess";
  /** Bara en gissning: texten säger "troligen". Gäller basis "server-guess". */
  likely?: boolean;
  /** Byrån syns också på sajten själv, eller servern har bekräftade kunder hos den. */
  confirmed?: boolean;
  /** Provet bakom en gissning: servern, hur många sajter som ligger på den, hur många av de lästa som nämner byrån, och några att öppna. */
  server?: { ip: string; sites: number; credited: number; examples: string[]; reason: string; /** credits: sidfötterna pekar ut byrån. host: serverns ägare är själv en webbyrå (lösare gissning). */ via?: "credits" | "host" };
}

export interface ProfilePlatformLink {
  domain: string;
  name: string;
  kind: string;
  url: string;
  /** Plattformen finns som källa i vår katalog. */
  supplierSlug: string | null;
}

export type WebsiteSourceKind = "input" | "catalog" | "places" | "none";

export interface CompanyProfile {
  version: 1;
  generatedAt: string;
  company: { id: string | null; name: string | null; orgnr: string | null; soleTrader: boolean; domain: string | null; website: string | null; websiteSource: WebsiteSourceKind; websiteVerified: boolean };
  overview: { summary: string | null; offering: Claim[]; audience: Claim | null };
  registry: RegistrySection;
  website: SiteSection;
  marketing: { tech: Detection[]; social: SocialLink[] };
  services: ServiceItem[];
  contact: { phones: string[]; emails: string[]; /** Personer som företaget anger på sin webbplats. Äldre profiler saknar dem. */ people?: Person[]; address: string | null; place: { name: string; address: string | null; phone: string | null; mapsUrl: string | null; rating?: number | null; ratingCount?: number | null; hours?: string[]; category?: string | null } | null };
  observations: Claim[];
  /** Tillkom i version 2 av sidan. Äldre profiler saknar dem. */
  talkingPoints?: Claim[];
  creator?: ProfileCreator | null;
  companyLogoPath?: string | null;
  platformLinks?: ProfilePlatformLink[];
  /** Öppna platsannonser, när företaget har några. Äldre profiler saknar dem. */
  jobs?: JobsSection | null;
  facts: Fact[];
  meta: {
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    steps: number;
    toolPages: string[];
    durationMs: number;
    costEstimateSek: number | null;
    aiStatus: "ok" | "disabled" | "failed" | "skipped";
    warnings: string[];
  };
}
