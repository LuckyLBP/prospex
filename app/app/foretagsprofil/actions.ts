"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfileAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseProfileInput } from "@/lib/profile/input";
import { failProfile, getOrgProfile, grantOrgAccess, ProfileStartError, requeueProfile, startProfile, sweepDeadProfiles } from "@/lib/profile/store";
import { triggerProfileBuild } from "@/lib/profile/trigger";
import { searchCompanies, type Candidate } from "@/lib/profile/name-search";
import type { ProfileProgress, StartResult } from "@/app/admin/foretagsprofil/actions";

// Företagsprofilen för bolag som en admin öppnat den för. Samma bygge som adminens, men varje anrop kräver att
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
  revalidatePath("/app/foretagsprofil");
  return { ok: true, id };
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
  if (!row) redirect("/app/foretagsprofil");
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
    if (e instanceof ProfileStartError) redirect(`/app/foretagsprofil/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(`/app/foretagsprofil/${id}`);
  redirect(`/app/foretagsprofil/${id}`);
}
