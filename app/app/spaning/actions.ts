"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfileAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requestCustomerList } from "@/lib/agencies/request";
import { parseProfileInput } from "@/lib/profile/input";
import { failProfile, getOrgProfile, grantOrgAccess, ProfileStartError, requeueProfile, startProfile, sweepDeadProfiles } from "@/lib/profile/store";
import { triggerProfileBuild } from "@/lib/profile/trigger";
import { searchCompanies, type Candidate } from "@/lib/profile/name-search";
import { findCompanyById } from "@/lib/companies/upsert";
import { normalizeDomain } from "@/lib/scrapers/domain";
import type { CompanyProfile } from "@/lib/profile/types";
import type { ProfileProgress, StartResult } from "@/app/admin/foretagsprofil/actions";

// Spaning (företagsprofilen) för bolag som en admin öppnat den för. Samma bygge som adminens, men varje anrop kräver att
// medlemmens bolag har åtkomst, och en profil kan bara öppnas av bolag som skapat eller uppdaterat den.

const SEARCH_LIMIT_PER_MINUTE = 10;
const recentSearches = new Map<string, number[]>();

export async function createProfileAction(raw: string): Promise<StartResult> {
  const m = await requireProfileAccess();
  const parsed = parseProfileInput(raw);
  if (parsed.kind === "error") return { ok: false, error: parsed.message };

  let id: string;
  try {
    const started = await startProfile(parsed, { id: m.user.id, orgId: m.org.id });
    id = started.id;
    if (!started.reused) {
      try {
        await triggerProfileBuild(id, { orgnr: parsed.kind === "orgnr" && parsed.soleTrader ? parsed.orgnr : null });
      } catch (e) {
        await failProfile(id, `Kunde inte starta bygget: ${e instanceof Error ? e.message : "okänt fel"}`);
      }
      await audit(m.user, "profile.create", "company", { id, name: parsed.kind === "url" ? parsed.domain : parsed.display, details: { input: parsed.kind === "url" ? parsed.domain : parsed.display, kind: parsed.kind, org: m.org.slug } });
    }
  } catch (e) {
    if (e instanceof ProfileStartError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/app/spaning");
  return { ok: true, id };
}

/** "Hitta företagen": ber om kundlistan för webbplatsen en spaning gjorts på. Sidan visar sedan läget. */
export async function requestCustomerListAction(f: FormData): Promise<void> {
  const m = await requireProfileAccess();
  const id = String(f.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const row = await getOrgProfile(id, m.org.id);
  if (!row?.domain) return;
  const profile = row.profile as CompanyProfile | null;
  await requestCustomerList({ domain: row.domain, name: profile?.company.name ?? row.name, orgId: m.org.id, userId: m.user.id, profileId: id });
  revalidatePath(`/app/spaning/${id}`);
}

export async function searchCompaniesAction(query: string): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; error: string }> {
  const m = await requireProfileAccess();
  const now = Date.now();
  const recent = (recentSearches.get(m.user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= SEARCH_LIMIT_PER_MINUTE) return { ok: false, error: "För många sökningar på kort tid. Vänta en stund." };
  recentSearches.set(m.user.id, [...recent, now]);
  return { ok: true, candidates: await searchCompanies(query) };
}

export async function profileProgressAction(id: string): Promise<ProfileProgress | null> {
  const m = await requireProfileAccess();
  await sweepDeadProfiles();
  const row = await getOrgProfile(id, m.org.id);
  return row ? { status: row.status, stage: row.stage, name: row.name ?? row.domain, error: row.error } : null;
}

export async function refreshProfileAction(f: FormData) {
  const m = await requireProfileAccess();
  const id = String(f.get("id") ?? "");
  const row = await getOrgProfile(id, m.org.id);
  if (!row) redirect("/app/spaning");
  try {
    await requeueProfile(id, { id: m.user.id });
    await grantOrgAccess(id, m.org.id);
    try {
      await triggerProfileBuild(id);
    } catch (e) {
      await failProfile(id, `Kunde inte starta bygget: ${e instanceof Error ? e.message : "okänt fel"}`);
    }
    await audit(m.user, "profile.refresh", "company", { id, name: row.name ?? row.input, details: { kind: row.input_kind, org: m.org.slug } });
  } catch (e) {
    if (e instanceof ProfileStartError) redirect(`/app/spaning/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(`/app/spaning/${id}`);
  redirect(`/app/spaning/${id}`);
}

export type ScanResult = { ok: true; id: string; reused: boolean } | { ok: false; error: string; needsSearch?: boolean };

/**
 * Skannar ett katalogföretag från Ringläge. Resultatet hamnar på just det företaget, även om det bara har namn och
 * telefon. Webbadressen kommer från företaget, annars org.nr, annars från kandidaten som den som ringer valt; saknas
 * allt tre är svaret `needsSearch` så att Ringläge kan söka på namnet.
 */
export async function scanCompanyAction(companyId: string, pick?: { buildFrom: string | null }): Promise<ScanResult> {
  const m = await requireProfileAccess();
  const company = await findCompanyById(companyId);
  if (!company) return { ok: false, error: "Företaget finns inte." };

  const raw = pick?.buildFrom?.trim() || normalizeDomain(company.domain ?? company.website) || company.orgnr;
  if (!raw) return { ok: false, error: "Företaget har ingen webbplats eller organisationsnummer i katalogen.", needsSearch: true };
  const parsed = parseProfileInput(raw);
  if (parsed.kind === "error") return { ok: false, error: parsed.message, needsSearch: !pick };

  try {
    const started = await startProfile(parsed, { id: m.user.id, orgId: m.org.id }, { targetCompanyId: company.id });
    if (!started.reused) {
      try {
        await triggerProfileBuild(started.id, { orgnr: parsed.kind === "orgnr" && parsed.soleTrader ? parsed.orgnr : null });
      } catch (e) {
        await failProfile(started.id, `Kunde inte starta bygget: ${e instanceof Error ? e.message : "okänt fel"}`);
      }
      await audit(m.user, "profile.create", "company", { id: started.id, name: company.name ?? raw, details: { input: parsed.kind === "url" ? parsed.domain : parsed.display, kind: parsed.kind, org: m.org.slug, source: "ringlage" } });
    }
    return { ok: true, id: started.id, reused: started.reused };
  } catch (e) {
    if (e instanceof ProfileStartError) return { ok: false, error: e.message };
    throw e;
  }
}
