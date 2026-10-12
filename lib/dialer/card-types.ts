import type { CallOutcome } from "@/lib/calls/outcomes";
import type { SiteIssue } from "@/lib/enrich/audit";

// Klientsäker (ingen databasimport). Datum är ISO-strängar så att kortet går att skicka till klienten.
export type CardContact = {
  outcome: CallOutcome | null;
  note: string | null;
  lastCalledAt: string | null;
  lastCalledByEmail: string | null;
  callCount: number;
  nextCallbackAt: string | null;
  callbackHasTime: boolean;
  meetingAt: string | null;
  archived: boolean;
};

export type CardLog = {
  outcome: CallOutcome;
  note: string | null;
  calledAt: string;
  userEmail: string;
  callbackAt: string | null;
  meetingAt: string | null;
};

export type CardNote = {
  id: string;
  body: string;
  createdAt: string;
  userEmail: string;
};

export type CardSite = {
  analysed: boolean;
  outdated: boolean | null;
  issues: SiteIssue[];
  /** "Byggd med WordPress (Elementor)", "Byggd av X", "Bokning: Bokadirekt". */
  facts: string[];
  /** De viktigaste SEO-bristerna, med en mening man kan säga högt. */
  seo: { label: string; detail: string }[];
};

export type CardRegistry = {
  active: boolean | null;
  legalForm: string | null;
  registeredYear: number | null;
  description: string | null;
  sni: string | null;
  proceedings: number;
  advertisingBlocked: boolean;
};

/** Det ur en skannad företagsprofil som ringläget visar. Själva profilen följer inte med kortet. */
export type CardProfile = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  /** Steget en pågående skanning är på, på svenska. */
  stageLabel: string | null;
  finishedAt: string | null;
  summary: string | null;
  people: { key: string; name: string; role: string | null; phone: string | null; email: string | null; photoUrl: string | null }[];
  figures: { revenue: number | null; profit: number | null; employees: number | null; year: string | null } | null;
  /** Omsättningens förändring mot förra året, i procent. */
  growth: number | null;
  /** Året bolaget registrerades. */
  founded: number | null;
  /** Det en säljare kan ta upp i samtalet, skrivet av profilen. Varje punkt stöds av ett belägg i profilen. */
  talkingPoints: string[];
  rating: { value: number; count: number | null } | null;
  /** Öppna platsannonser: ett tecken på att företaget växer. */
  jobs: { total: number; ads: { title: string; city: string | null; url: string }[] } | null;
  offering: string[];
  audience: string | null;
  /** Tekniker och verktyg på webbplatsen, till exempel bokning, e-handel och annonsering. */
  tech: { name: string; category: string }[];
  hours: string[];
  address: string | null;
  mapsUrl: string | null;
  social: { network: string; url: string }[];
  /** Byrån som byggt webbplatsen, när profilen vet det. */
  builtBy: string | null;
};

export type DialerCard = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  orgnr: string | null;
  city: string | null;
  signals: { supplier: string; logo: string | null; kind: "supplier" | "list"; icon: string | null; names_brand: boolean; source_url: string | null }[];
  contact: CardContact | null;
  logs: CardLog[];
  notes: CardNote[];
  site: CardSite;
  registry: CardRegistry | null;
  /** Bolaget har Företagsprofil och kan skanna företaget härifrån. */
  canScan: boolean;
  /** Företagets profil, om bolaget har skannat det eller fått den. */
  profile: CardProfile | null;
};

/** Hur många kort som hämtas per anrop. */
export const CARD_BATCH_MAX = 12;
