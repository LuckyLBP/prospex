import { pool } from "@/lib/db";
import { isBolagsverketTest } from "@/lib/bolagsverket/client";
import type { CompanyRegistry } from "@/lib/bolagsverket/types";
import { findCompanyById, upsertCompany } from "@/lib/companies/upsert";
import { agencyModel, agencyModelId, estimateCostSek, isAiConfigured, isAnthropicConfigured } from "@/lib/ai/model";
import { maybeStartAgency } from "@/lib/agencies/auto";
import { getAgencyByDomain } from "@/lib/agencies/store";
import { linkServerToAgencyDomain, recordSiteIps } from "@/lib/agencies/server-guess";
import { runAgent, type AgentContext } from "./agent";
import { assembleProfile } from "./assemble";
import { FactBook } from "./facts";
import { gather } from "./gather";
import { buildNetwork, presenceFacts } from "./network";
import { findJobs, jobFacts } from "./jobs";
import { extractPeople, personKey, type Person, type PeopleResult } from "./people";
import { condensePage } from "./people-text";
import { loadPhotoCache, loadSuppressed, savePeople } from "./people-store";
import { storePhotos } from "./people-photos";
import { lookupPlace, placeFacts } from "./place-lookup";
import { parseProfileInput, type ProfileInput } from "./input";
import { resolveInput, type Resolved } from "./resolve";
import { servicesFromFacts } from "./services";
import { failProfile, finishProfile, getProfile, markRunning, setIdentity, setStage } from "./store";

// Bygger en profil, steg för steg: hitta företaget, lägg in det i katalogen, samla fakta, låt AI:n skriva,
// granska och spara. Allt under en gemensam gräns på 240 sekunder (routen får köra 300).

const BUILD_DEADLINE_MS = 240_000;

type Parsed = Extract<ProfileInput, { kind: "orgnr" | "url" }>;

export interface BuildDeps {
  resolveInput: typeof resolveInput;
  gather: typeof gather;
  runAgent: typeof runAgent;
  aiConfigured: () => boolean;
  buildNetwork: typeof buildNetwork;
  /** Startar en byrå som profilen hittat. Utbytbar så att tester inte når databasen eller nätet. */
  maybeStartAgency?: typeof maybeStartAgency;
  /** Kontaktpersoner ur sidorna. Utbytbar så att tester inte når modellen. */
  extractPeople?: (pages: ReturnType<typeof condensePage>[], company: { name: string | null; domain: string | null }) => Promise<PeopleResult>;
}

const defaultDeps: BuildDeps = { resolveInput, gather, runAgent, aiConfigured: isAiConfigured, buildNetwork };

/** Vad profilen byggs från. En enskild firmas nummer sparas inte, så vid uppdatering återstår webbplatsen. */
export function inputForBuild(row: { input_kind: "url" | "orgnr"; input: string; orgnr: string | null; sole_trader: boolean; domain: string | null }, orgnrFromCaller: string | null): { parsed: Parsed | null; note: string | null } {
  const parseOk = (raw: string): Parsed | null => {
    const p = parseProfileInput(raw);
    return p.kind === "orgnr" || p.kind === "url" ? p : null;
  };
  if (row.input_kind === "url") return { parsed: parseOk(row.input), note: null };
  if (!row.sole_trader) return { parsed: parseOk(row.orgnr ?? row.input), note: null };
  if (orgnrFromCaller) return { parsed: parseOk(orgnrFromCaller), note: null };
  if (row.domain) return { parsed: parseOk(row.domain), note: "Numret för en enskild firma sparas inte, så Bolagsverkets uppgifter hämtades inte om. Skapa profilen på nytt med numret för att uppdatera dem." };
  return { parsed: null, note: null };
}

async function cachedRegistry(companyId: string | null): Promise<unknown> {
  if (!companyId) return null;
  const { rows } = await pool.query(`select registry from companies where id = $1`, [companyId]);
  return rows[0]?.registry ?? null;
}

/** Namn och ort från resolve sparas som färsk registerdata, så att gather inte frågar Bolagsverket en gång till. */
async function saveOrganisation(companyId: string, org: CompanyRegistry): Promise<void> {
  if (isBolagsverketTest()) return;
  await pool.query(
    `update companies set registry = jsonb_build_object('version', 1, 'organisation', $2::jsonb, 'organisationFetchedAt', now()), registry_checked_at = now() where id = $1 and registry is null`,
    [companyId, JSON.stringify(org)],
  );
}

export async function buildProfile(id: string, opts: { orgnr?: string | null } = {}, deps: BuildDeps = defaultDeps): Promise<void> {
  const row = await getProfile(id);
  if (!row) return;
  if (!(await markRunning(id))) return;
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), BUILD_DEADLINE_MS);

  try {
    const { parsed, note } = inputForBuild(row, opts.orgnr ?? null);
    if (!parsed) {
      await failProfile(id, "Det går inte att bygga profilen: webbadress och organisationsnummer saknas. Skapa profilen på nytt.");
      return;
    }

    // 1. Hitta företaget och dess webbplats.
    await setStage(id, "resolve");
    const resolved: Resolved = await deps.resolveInput(parsed);
    if (note) resolved.warnings.push(note);
    // En skanning från Ringläge gäller ett utpekat katalogföretag: det väljs framför det som ingången annars hittar,
    // så att resultatet hamnar på just den raden och inte på en ny.
    if (row.target_company_id) {
      const target = await findCompanyById(row.target_company_id);
      if (target) {
        resolved.catalog = target;
        resolved.name = resolved.name ?? target.name;
      }
    }

    // 2. Lägg in företaget i katalogen. En enskild firma får aldrig ett nummer där.
    const soleTrader = resolved.soleTrader;
    const key = resolved.domain ?? (resolved.orgnr && !soleTrader ? `orgnr:${resolved.orgnr}` : `profil:${id}`);
    const name = resolved.organisation?.name ?? resolved.name;
    let companyId = resolved.catalog?.id ?? null;
    const up = await upsertCompany({ dedupeKey: resolved.catalog?.dedupe_key ?? key, domain: resolved.domain, name, orgnr: soleTrader ? null : resolved.orgnr, website: resolved.domain ? `https://${resolved.domain}` : null });
    companyId = up.id;
    if (up.orgnrConflict) resolved.warnings.push("Företaget har redan ett annat organisationsnummer i katalogen, som behålls.");
    if (resolved.organisation && !soleTrader) await saveOrganisation(companyId, resolved.organisation);
    await setIdentity(id, { name, domain: resolved.domain, orgnr: resolved.orgnrDisplay });

    // 3. Samla fakta.
    await setStage(id, resolved.domain ? "website" : "registry");
    const placePromise = lookupPlace({ companyId, name, city: resolved.organisation?.address?.city ?? resolved.city, domain: resolved.domain, known: resolved.place });
    const jobsEarly = resolved.orgnr && !soleTrader ? findJobs(resolved.orgnr) : null;
    const gathered = await deps.gather({ orgnr: resolved.orgnr, soleTrader, domain: resolved.domain, companyId, websiteUnverified: resolved.websiteSource === "places" && !resolved.websiteVerified, registryCached: await cachedRegistry(companyId) });

    // En webbplats som visat sig höra till ett annat företag används inte: ta bort den ur katalogens post.
    if (gathered.site.status === "mismatch") await pool.query(`update companies set domain = null, website = null where id = $1 and domain = $2`, [companyId, resolved.domain]);
    if (gathered.orgnr && !soleTrader && gathered.orgnr !== resolved.orgnr) await upsertCompany({ dedupeKey: resolved.catalog?.dedupe_key ?? key, domain: resolved.domain, name, orgnr: gathered.orgnr });

    // 3b. Kontaktpersoner ur sidorna som hämtades. Ett fel här ger inga personer och aldrig ett misslyckat bygge.
    await setStage(id, "people");
    let people: Person[] = [];
    try {
      const found = await (deps.extractPeople ?? extractPeople)(gathered.peoplePages.map((p) => condensePage(p.html, p.url)), { name, domain: gathered.siteDomain });
      const suppressed = companyId ? await loadSuppressed(companyId) : new Set<string>();
      people = found.people.filter((p) => !suppressed.has(personKey(p.name)));
      // Porträtten förminskas och sparas (bara ett par kB per person), och en bild från samma adress hämtas inte igen.
      if (companyId) people = await storePhotos(companyId, people, await loadPhotoCache(companyId));
      if (companyId) await savePeople(companyId, people);
      if (found.pagesRead > 0) console.log(`[profil ${id}] ${people.length} kontaktpersoner ur ${found.pagesRead} sidor, cirka ${found.costSek.toFixed(2)} kr`);
    } catch (e) {
      console.error(`[profil ${id}] kontaktpersonerna misslyckades:`, e instanceof Error ? e.message : e);
    }

    // 4. Kopplingar: logotyper, vilka av våra källor som har företaget, plattformar sajten länkar till. Ett fel här
    //    ger en tom del och aldrig ett misslyckat bygge.
    await setStage(id, "network");
    const network = await deps.buildNetwork({ creator: gathered.creator, siteDomain: gathered.site.status === "ok" ? gathered.siteDomain : null, companyName: name, platformLinks: gathered.platformLinks, companyId, siteIps: gathered.ips }).catch((e) => {
      console.error(`[profil ${id}] kopplingarna misslyckades:`, e instanceof Error ? e.message : e);
      return { creator: null, companyLogoPath: null, platformLinks: [], presence: [] } as Awaited<ReturnType<typeof buildNetwork>>;
    });

    // Servern minns vi för nästa gång: varje profil gör uppslaget "vilka sajter ligger på samma server" billigare.
    if (gathered.site.status === "ok") await recordSiteIps(gathered.siteDomain, gathered.ips);

    // 5. AI.
    const book = FactBook.from(gathered.facts);
    presenceFacts(book, network.presence);
    const place = await placePromise;
    placeFacts(book, place);
    // Org.nr kan först ha hittats på webbplatsen.
    const jobs = await (jobsEarly ?? (gathered.orgnr && !soleTrader ? findJobs(gathered.orgnr) : Promise.resolve(null)));
    jobFacts(book, jobs);
    const ctx: AgentContext = { book, texts: gathered.texts, pages: gathered.pages, inventory: gathered.inventory, boundary: gathered.boundary ?? "", budget: gathered.budget };
    let model = null as Awaited<ReturnType<typeof runAgent>> | null;
    let aiStatus: "ok" | "disabled" | "failed" | "skipped" = "ok";
    const hasMaterial = gathered.texts.length > 0 || gathered.registry.status === "ok";
    // En byrås egen profil skrivs av Claude när det finns en nyckel, annars av standardmodellen.
    const isAgency = isAnthropicConfigured() && !!(await getAgencyByDomain(gathered.siteDomain).catch(() => null));
    // Hittade profilen en byrå vi inte känner? Då startas den (egen källa, profil och kundsökning), inom tak.
    const server = network.creator?.basis === "server-guess" ? network.creator.server ?? null : null;
    const auto = await (deps.maybeStartAgency ?? maybeStartAgency)({ creator: network.creator, customerDomain: resolved.domain, isAgencyProfile: isAgency, foundVia: server ? { ip: server.ip, sites: server.sites } : null });
    if (server && network.creator?.domain) await linkServerToAgencyDomain(server.ip, network.creator.domain);
    if (auto.started) console.log(`[profil ${id}] startade byrån ${auto.domain}`);
    const modelChoice = isAgency ? { id: agencyModelId(), model: agencyModel() } : undefined;
    if (!modelChoice && !deps.aiConfigured()) aiStatus = "disabled";
    else if (!hasMaterial) aiStatus = "skipped";
    else {
      await setStage(id, "ai");
      try {
        model = await deps.runAgent({ company: { name: name ?? gathered.contact.companyName, orgnr: resolved.orgnrDisplay, domain: gathered.siteDomain }, ctx, knownServices: servicesFromFacts(book.all()), signal: abort.signal, modelChoice });
      } catch (e) {
        aiStatus = "failed";
        console.error(`[profil ${id}] AI-steget misslyckades:`, e instanceof Error ? e.message : e);
      }
    }

    // 6. Granska, sätt ihop och spara.
    await setStage(id, "save");
    const facts = book.all();
    const durationMs = Date.now() - started;
    const modelPages = gathered.pages.filter((p) => p.via === "model" && !p.problem).map((p) => p.url);
    const profile = assembleProfile({
      resolved, gathered, companyId, model: model?.output ?? null, texts: ctx.texts, place, jobs, people, facts, creator: network.creator, companyLogoPath: network.companyLogoPath, platformLinks: network.platformLinks,
      meta: { model: model?.model ?? null, inputTokens: model?.inputTokens ?? 0, outputTokens: model?.outputTokens ?? 0, steps: model?.steps ?? 0, toolPages: modelPages, durationMs, costEstimateSek: model ? estimateCostSek(model.model, model.inputTokens, model.outputTokens) : null, aiStatus },
    });

    // Kontaktuppgifterna från webbplatsen fyller på katalogens post, utan att skriva över något känt.
    await upsertCompany({ dedupeKey: resolved.catalog?.dedupe_key ?? key, domain: resolved.domain, name, phone: gathered.contact.phones[0] ?? null, email: gathered.contact.emails[0] ?? null });

    await finishProfile(id, {
      companyId, name: profile.company.name, orgnr: resolved.orgnrDisplay, domain: profile.company.domain, profile, facts, pages: gathered.pages,
      model: model?.model ?? null, inputTokens: model?.inputTokens ?? null, outputTokens: model?.outputTokens ?? null, steps: model?.steps ?? null, durationMs, warnings: profile.meta.warnings,
    });
  } catch (e) {
    console.error(`[profil ${id}] bygget misslyckades:`, e);
    await failProfile(id, `Oväntat fel: ${e instanceof Error ? e.message : "okänt"}`);
  } finally {
    clearTimeout(timer);
  }
}
