import { STAGE_LABEL, type ProfileStage } from "@/lib/profile/stages";
import { personKey } from "@/lib/profile/people";
import type { CardProfile } from "./card-types";

// Ur en lagrad företagsprofil: bara det ringläget behöver (sammanfattning, personer, nyckeltal). Ren och testad,
// så att kortet aldrig bär hela profilen.

export interface ProfileRowForCard {
  id: string;
  status: string;
  stage: string | null;
  finished_at: string | Date | null;
  summary: string | null;
  people: unknown;
  figures: unknown;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const STATUSES = ["queued", "running", "done", "error"] as const;

/** Högst så många personer visas i ringläget. Resten finns i hela profilen. */
export const MAX_CARD_PEOPLE = 6;

export function cardProfile(r: ProfileRowForCard, photoUrls: ReadonlyMap<string, string> = new Map()): CardProfile {
  const people = (Array.isArray(r.people) ? r.people : [])
    .flatMap((p: Record<string, unknown>) => {
      const name = str(p?.name, 80);
      if (!name) return [];
      const photoPath = str(p.photoPath, 200);
      return [{ key: personKey(name), name, role: str(p.role, 80), phone: str(p.phone, 30), email: str(p.email, 120), photoUrl: (photoPath && photoUrls.get(photoPath)) || null }];
    })
    // De som går att ringa först.
    .sort((a, b) => Number(!!b.phone) - Number(!!a.phone))
    .slice(0, MAX_CARD_PEOPLE);

  const f = (r.figures ?? null) as Record<string, unknown> | null;
  const figures = f && (num(f.revenue) !== null || num(f.profit) !== null || num(f.employees) !== null)
    ? { revenue: num(f.revenue), profit: num(f.profit), employees: num(f.employees), year: typeof f.periodEnd === "string" ? f.periodEnd.slice(0, 4) : null }
    : null;

  const status = (STATUSES as readonly string[]).includes(r.status) ? (r.status as CardProfile["status"]) : "error";
  return {
    id: r.id,
    status,
    stageLabel: r.stage && r.stage in STAGE_LABEL ? STAGE_LABEL[r.stage as ProfileStage] : null,
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    summary: str(r.summary, 400),
    people,
    figures,
  };
}
