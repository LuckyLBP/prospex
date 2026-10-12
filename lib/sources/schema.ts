import { z } from "zod";
import { SCRIPT_KEYS } from "@/lib/scrapers/scripts/manifest";

/**
 * What a profile's `config` may contain, per method.
 *
 * These schemas are used TWICE, and that is the point: the admin form parses
 * a submission with them, and the collector parses the stored jsonb with them
 * before a run. A config that was valid when it was saved but no longer is --
 * a script that has been removed, say -- therefore fails the run with a
 * readable message instead of crashing somewhere inside a fetch.
 */

export const publicwwwConfigSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, "Ange en sökfråga.")
    .max(200, "Sökfrågan får vara högst 200 tecken."),
  maxResults: z.coerce
    .number()
    .int("Ange ett heltal.")
    .min(1, "Minst 1.")
    .max(5000, "Högst 5000.")
    .default(1000),
});

export const VIEWDNS_ENDPOINTS = ["reverseip", "reversens", "reversewhois"] as const;
export type ViewdnsEndpoint = (typeof VIEWDNS_ENDPOINTS)[number];

export const VIEWDNS_ENDPOINT_LABELS: Record<ViewdnsEndpoint, { label: string; targetLabel: string }> =
  {
    reverseip: { label: "Reverse IP (domäner på samma server)", targetLabel: "IP-adress eller domän" },
    reversens: { label: "Reverse NS (domäner på samma namnserver)", targetLabel: "Namnserver" },
    reversewhois: { label: "Reverse WHOIS (domäner på samma ägare)", targetLabel: "Sökterm, t.ex. mejladress" },
  };

export const viewdnsConfigSchema = z.object({
  endpoint: z.enum(VIEWDNS_ENDPOINTS, { message: "Välj en uppslagstyp." }),
  target: z
    .string()
    .trim()
    .min(1, "Ange ett mål.")
    .max(253, "Målet får vara högst 253 tecken."),
  maxPages: z.coerce
    .number()
    .int("Ange ett heltal.")
    .min(1, "Minst 1.")
    .max(5, "Högst 5 sidor per körning.")
    .default(1),
});

/**
 * En lista med domäner, en per rad.
 *
 * Lagras som texten någon klistrade in och inte som en array: det som skrevs in
 * är det som visas i formuläret igen, och normaliseringen (`normalizeDomain`)
 * hör hemma i kollektorn där varje annan metods domäner också passerar. Fältet
 * är stort med flit -- de här listorna är tusentals rader långa.
 */
export const domainlistConfigSchema = z.object({
  domains: z
    .string()
    .trim()
    .min(1, "Klistra in minst en domän.")
    .max(200_000, "Listan får vara högst 200 000 tecken."),
});

/**
 * Google Places: söktermer gånger orter.
 *
 * Båda fälten lagras som den text någon skrev, en per rad, av samma skäl som
 * domänlistan: det som skrevs in är det som visas i formuläret igen. Varje
 * kombination blir en sökning "<term> i <ort>", så gränserna är till för
 * kvoten: 10 termer x 60 orter är redan 600 sökningar, före sidbläddringen.
 */
export const GOOGLEPLACES_MAX_LINES = 60;

function lineCount(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
}

export const googleplacesConfigSchema = z.object({
  queries: z
    .string()
    .trim()
    .min(2, "Ange minst en sökterm.")
    .max(2_000, "Högst 2 000 tecken.")
    .refine((text) => lineCount(text) <= 10, "Högst 10 söktermer."),
  locations: z
    .string()
    .trim()
    .min(2, "Ange minst en ort.")
    .max(5_000, "Högst 5 000 tecken.")
    .refine(
      (text) => lineCount(text) <= GOOGLEPLACES_MAX_LINES,
      `Högst ${GOOGLEPLACES_MAX_LINES} orter.`,
    ),
  maxPages: z.coerce
    .number()
    .int("Ange ett heltal.")
    .min(1, "Minst 1.")
    .max(3, "Högst 3 sidor per sökning.")
    .default(3),
});

/**
 * En byrå: namn och domän. Kollektorn letar kandidater (kunder i vår egen katalog, PublicWWW på byråns domän, och
 * ViewDNS när uppslaget blir precist) och lägger in dem först när kundens egen sajt visat byrån i sidfoten.
 */
export const agencyConfigSchema = z.object({
  agencyName: z.string().trim().min(2, "Ange byråns namn.").max(80, "Namnet får vara högst 80 tecken."),
  domain: z.string().trim().min(3, "Ange byråns domän.").max(253, "Domänen får vara högst 253 tecken."),
  maxCandidates: z.coerce.number().int("Ange ett heltal.").min(10, "Minst 10.").max(3000, "Högst 3 000.").default(1000),
  useViewdns: z.coerce.boolean().default(true),
  useClaude: z.coerce.boolean().default(true),
});

export const scriptConfigSchema = z.object({
  script: z.enum(SCRIPT_KEYS, { message: "Välj ett skript." }),
});

export type PublicwwwConfig = z.infer<typeof publicwwwConfigSchema>;
export type ViewdnsConfig = z.infer<typeof viewdnsConfigSchema>;
export type AgencyConfig = z.infer<typeof agencyConfigSchema>;
export type ScriptConfig = z.infer<typeof scriptConfigSchema>;
export type DomainlistConfig = z.infer<typeof domainlistConfigSchema>;
export type GoogleplacesConfig = z.infer<typeof googleplacesConfigSchema>;

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The fields every profile has, whatever its method. */
const profileBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ange ett namn.")
    .max(80, "Namnet får vara högst 80 tecken."),
  slug: z
    .string()
    .trim()
    .max(60, "Adressnamnet får vara högst 60 tecken.")
    .refine((value) => value === "" || SLUG_RE.test(value), {
      message: "Endast små bokstäver, siffror och bindestreck.",
    })
    .optional()
    .default(""),
  description: z.string().trim().max(500, "Högst 500 tecken.").optional().default(""),
  published: z.coerce.boolean(),
  enrichSites: z.coerce.boolean(),
});

/**
 * A whole profile submission. The method and its config travel together as a
 * discriminated union, so "a ViewDNS profile carrying a PublicWWW query" is
 * not a state this type can be in.
 */
export const profileInputSchema = z.discriminatedUnion("method", [
  profileBaseSchema.extend({ method: z.literal("publicwww"), config: publicwwwConfigSchema }),
  profileBaseSchema.extend({ method: z.literal("viewdns"), config: viewdnsConfigSchema }),
  profileBaseSchema.extend({ method: z.literal("script"), config: scriptConfigSchema }),
  profileBaseSchema.extend({ method: z.literal("domainlist"), config: domainlistConfigSchema }),
  profileBaseSchema.extend({ method: z.literal("googleplaces"), config: googleplacesConfigSchema }),
  profileBaseSchema.extend({ method: z.literal("agency"), config: agencyConfigSchema }),
]);

export type ProfileInput = z.infer<typeof profileInputSchema>;
