import type { FactBook } from "./facts";

// Öppna platsannonser för ett företag ur Arbetsförmedlingens JobSearch (JobTech), som en rekryteringssignal. Gratis och
// öppet. Bara organisationsnumret används: ett namnsök ger tusentals orelaterade träffar. Ett fel ger "inga annonser",
// aldrig ett misslyckat bygge.

const ENDPOINT = "https://jobsearch.api.jobtechdev.se/search";
const MAX_ADS = 10;

export interface JobAd {
  id: string;
  title: string;
  occupation: string | null;
  city: string | null;
  /** yyyy-mm-dd */
  published: string | null;
  deadline: string | null;
  url: string;
}

export interface JobsSection {
  /** Antal öppna annonser, även de som inte rymdes i `ads`. */
  total: number;
  ads: JobAd[];
}

interface RawHit {
  id?: string;
  headline?: string;
  webpage_url?: string;
  publication_date?: string;
  application_deadline?: string;
  employer?: { organization_number?: string };
  occupation?: { label?: string };
  workplace_address?: { municipality?: string; city?: string };
}

const day = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

/** Annonserna i ett svar, bara de som verkligen är företagets. Ren. */
export function mapJobs(response: unknown, orgnrDigits: string): JobsSection {
  const r = response as { total?: { value?: number }; hits?: RawHit[] } | null;
  const ads = (r?.hits ?? [])
    .filter((h) => h.id && h.headline && h.webpage_url && h.employer?.organization_number === orgnrDigits)
    .map((h): JobAd => ({
      id: h.id!,
      title: h.headline!.trim().slice(0, 120),
      occupation: h.occupation?.label ?? null,
      city: h.workplace_address?.municipality ?? h.workplace_address?.city ?? null,
      published: day(h.publication_date),
      deadline: day(h.application_deadline),
      url: h.webpage_url!,
    }))
    .slice(0, MAX_ADS);
  return { total: Math.max(ads.length, r?.total?.value ?? 0), ads };
}

export interface JobsDeps {
  fetch: typeof globalThis.fetch;
}

/** Öppna annonser för ett organisationsnummer (`XXXXXX-XXXX`), eller null när inget gick att hämta eller inga finns. */
export async function findJobs(orgnr: string | null, deps: JobsDeps = { fetch: globalThis.fetch }): Promise<JobsSection | null> {
  const digits = orgnr?.replace(/\D/g, "") ?? "";
  if (digits.length !== 10) return null;
  try {
    const response = await deps.fetch(`${ENDPOINT}?employer=${digits}&limit=${MAX_ADS}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const jobs = mapJobs(await response.json(), digits);
    return jobs.ads.length > 0 ? jobs : null;
  } catch {
    return null;
  }
}

/** Annonserna som fakta som modellen kan hänvisa till. Ren. */
export function jobFacts(book: FactBook, jobs: JobsSection | null): void {
  if (!jobs) return;
  book.add({ kind: "jobs", label: "Öppna platsannonser", value: `${jobs.total} ${jobs.total === 1 ? "annons" : "annonser"} hos Arbetsförmedlingen`, source: "Arbetsförmedlingen", detector: "jobs:count" });
  for (const ad of jobs.ads.slice(0, 5)) {
    book.add({ kind: "jobs", label: "Platsannons", value: [ad.title, ad.city, ad.published ? `publicerad ${ad.published}` : null].filter(Boolean).join(", "), source: ad.url, detector: `job:${ad.id}` });
  }
}
