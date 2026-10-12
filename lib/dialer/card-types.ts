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
};

/** Hur många kort som hämtas per anrop. */
export const CARD_BATCH_MAX = 12;
