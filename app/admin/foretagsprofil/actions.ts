"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseProfileInput } from "@/lib/profile/input";
import { failProfile, getProfile, ProfileStartError, requeueProfile, startProfile, sweepDeadProfiles, type ProfileStage } from "@/lib/profile/store";
import { triggerProfileBuild } from "@/lib/profile/trigger";
import { searchCompanies, type Candidate } from "@/lib/profile/name-search";
import { setCreditKind, type CreditKind } from "@/lib/agencies/classify";
import { learnFromReview } from "@/lib/agencies/server-guess";
import { displayName } from "@/lib/agencies/request";
import { AgencyError, ensureAgencySupplier } from "@/lib/agencies/store";
import type { CompanyProfile } from "@/lib/profile/types";
import { removePersonFromProfile, suppressPerson } from "@/lib/profile/people-store";
import { normalizeDomain } from "@/lib/scrapers/domain";
import { triggerRun } from "@/lib/runs/start";
import { RunStartError } from "@/lib/runs/errors";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const toList = (error: string): never => redirect(`/admin/foretagsprofil?error=${encodeURIComponent(error)}`);

export type StartResult = { ok: true; id: string } | { ok: false; error: string };
export type ProfileProgress = { status: "queued" | "running" | "done" | "error"; stage: ProfileStage | null; name: string | null; error: string | null };

/** Skapar en profil från en webbadress eller ett org.nr och startar bygget. Sökfältet följer sedan bygget på samma sida. */
export async function createProfileAction(raw: string): Promise<StartResult> {
  const a = await requireAdmin();
  const parsed = parseProfileInput(raw);
  if (parsed.kind === "error") return { ok: false, error: parsed.message };

  let id: string;
  try {
    const started = await startProfile(parsed, { id: a.user.id });
    id = started.id;
    if (!started.reused) {
      try {
        // En enskild firmas nummer sparas inte: det följer bara med själva anropet och används i minnet.
        await triggerProfileBuild(id, { orgnr: parsed.kind === "orgnr" && parsed.soleTrader ? parsed.orgnr : null });
      } catch (e) {
        await failProfile(id, `Kunde inte starta bygget: ${e instanceof Error ? e.message : "okänt fel"}`);
      }
      await audit(a.user, "profile.create", "company", { id, name: parsed.kind === "url" ? parsed.domain : parsed.display, details: { input: parsed.kind === "url" ? parsed.domain : parsed.display, kind: parsed.kind } });
    }
  } catch (e) {
    if (e instanceof ProfileStartError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/admin/foretagsprofil");
  return { ok: true, id };
}

const SEARCH_LIMIT_PER_MINUTE = 20;
const recentSearches = new Map<string, number[]>();

/** Kandidater för ett företagsnamn. Googles kvot delas med insamlingen, så antalet sökningar per minut begränsas (per instans, bästa möjliga). */
export async function searchCompaniesAction(query: string): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; error: string }> {
  const a = await requireAdmin();
  const now = Date.now();
  const recent = (recentSearches.get(a.user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= SEARCH_LIMIT_PER_MINUTE) return { ok: false, error: "För många sökningar på kort tid. Vänta en stund." };
  recentSearches.set(a.user.id, [...recent, now]);
  return { ok: true, candidates: await searchCompanies(query) };
}

/** Var bygget är just nu, för förloppet i sökfältet. */
export async function profileProgressAction(id: string): Promise<ProfileProgress | null> {
  await requireAdmin();
  await sweepDeadProfiles();
  const row = await getProfile(id);
  return row ? { status: row.status, stage: row.stage, name: row.name ?? row.domain, error: row.error } : null;
}

/** Bygger om en färdig eller felad profil. Den gamla ligger kvar tills den nya är klar. */
export async function refreshProfileAction(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  const row = await getProfile(id);
  if (!row) return toList("Profilen finns inte.");
  try {
    await requeueProfile(id, { id: a.user.id });
    try {
      await triggerProfileBuild(id);
    } catch (e) {
      await failProfile(id, `Kunde inte starta bygget: ${e instanceof Error ? e.message : "okänt fel"}`);
    }
    await audit(a.user, "profile.refresh", "company", { id, name: row.name ?? row.input, details: { kind: row.input_kind } });
  } catch (e) {
    if (e instanceof ProfileStartError) redirect(`/admin/foretagsprofil/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(`/admin/foretagsprofil/${id}`);
  redirect(`/admin/foretagsprofil/${id}`);
}

const backTo = (f: FormData) => {
  const to = str(f, "return_to");
  return to.startsWith("/admin/foretagsprofil") ? to : "/admin/foretagsprofil";
};
const WRONG_KINDS: CreditKind[] = ["platform", "not-agency"];

/** "Fel byrå?": rättar vad en sidfotskredit är. Gäller alla framtida profiler, och hindrar att en byrå startas för den. */
export async function setCreditKindAction(f: FormData) {
  const a = await requireAdmin();
  const domain = normalizeDomain(str(f, "domain"));
  const kind = str(f, "kind") as CreditKind;
  const name = str(f, "name").slice(0, 120) || (domain ?? "");
  if (!domain || !WRONG_KINDS.includes(kind)) redirect(`${backTo(f)}?error=${encodeURIComponent("Ogiltig rättelse.")}`);
  await learnFromReview({ domain }, "rejected");
  await setCreditKind(domain, name, kind, kind === "platform" ? "Rättat av en admin: en plattform." : "Rättat av en admin: ingen byrå.");
  await audit(a.user, "source.update", "source", { id: domain, name, details: { kind: "supplier", changes: { credit_kind: kind } } });
  revalidatePath("/admin/foretagsprofil");
  redirect(`${backTo(f)}?ok=${encodeURIComponent("Sparat. Tryck på Uppdatera för att se ändringen på profilen.")}`);
}

/** Försöker igen med kundsökningen för en byrå vars senaste körning misslyckades. */
export async function retryAgencyRunAction(f: FormData) {
  await requireAdmin();
  const supplierId = str(f, "supplier_id");
  if (!/^[0-9a-f-]{36}$/i.test(supplierId)) redirect(backTo(f));
  try {
    await triggerRun(supplierId);
  } catch (e) {
    if (e instanceof RunStartError) redirect(`${backTo(f)}?error=${encodeURIComponent(e.message)}`);
    redirect(`${backTo(f)}?error=${encodeURIComponent(`Kunde inte starta körningen: ${e instanceof Error ? e.message : "okänt fel"}`)}`);
  }
  revalidatePath("/admin/foretagsprofil");
  redirect(`${backTo(f)}?ok=${encodeURIComponent("Kundsökningen startades igen.")}`);
}

/** Tar bort en kontaktperson för gott: den visas inte längre och läggs inte tillbaka när profilen byggs om. */
export async function removePersonAction(f: FormData) {
  const a = await requireAdmin();
  const profileId = str(f, "profile_id");
  const key = str(f, "key").slice(0, 120);
  const row = await getProfile(profileId);
  if (!row || !key) redirect("/admin/foretagsprofil?error=" + encodeURIComponent("Profilen finns inte."));
  const back = `/admin/foretagsprofil/${profileId}`;
  if (row.company_id) await suppressPerson(row.company_id, key);
  await removePersonFromProfile(profileId, key);
  await audit(a.user, "company.person_remove", "company", { id: row.company_id ?? profileId, name: row.name ?? row.input, details: { key } });
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Personen togs bort och läggs inte tillbaka.")}`);
}

/**
 * "Leta efter kunder" på en profil: skapar byrån som källa (opublicerad) och startar sökningen efter dess kunder.
 * Admin har ingen bolagskoppling, så det går inte via bolagens "Hitta företagen". Inget visas för kunder förrän en admin publicerat.
 */
export async function findCustomersAction(f: FormData) {
  const a = await requireAdmin();
  const id = String(f.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(backTo(f));
  const back = `/admin/foretagsprofil/${id}`;
  const row = await getProfile(id);
  const domain = normalizeDomain(row?.domain);
  if (!row || !domain) redirect(`${back}?error=${encodeURIComponent("Profilen har ingen webbplats att leta kunder för.")}`);
  const profile = row.profile as CompanyProfile | null;
  try {
    const source = await ensureAgencySupplier({ name: displayName(profile?.company.name ?? row.name, domain), domain, logoPath: profile?.companyLogoPath ?? null });
    if (source.created) await audit(a.user, "source.create", "source", { id: source.slug, name: source.name, details: { kind: "supplier", method: "agency", domain, from: "profile" } });
    await triggerRun(source.id);
  } catch (e) {
    // En körning som redan pågår är precis vad vi vill ha.
    if (!(e instanceof RunStartError)) {
      const message = e instanceof AgencyError ? e.message : `Kunde inte starta sökningen: ${e instanceof Error ? e.message : "okänt fel"}`;
      redirect(`${back}?error=${encodeURIComponent(message)}`);
    }
  }
  revalidatePath(back);
  redirect(back);
}
