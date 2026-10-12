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
  /** Utdrag ur profilen: det som visas i kortets utökade del. */
  extra?: unknown;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const STATUSES = ["queued", "running", "done", "error"] as const;

/** Högst så många personer visas i ringläget. Resten finns i hela profilen. */
export const MAX_CARD_PEOPLE = 6;
const MAX_POINTS = 4;
const MAX_OFFERING = 5;
const MAX_TECH = 12;
const MAX_JOBS = 3;

/** Bara webbadresser som börjar på http eller https: allt annat (javascript:, data:) släpps aldrig igenom. */
const url = (v: unknown): string | null => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim().slice(0, 500) : null);
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);

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

  const x = (r.extra ?? {}) as Record<string, unknown>;
  const place = (x.place ?? null) as Record<string, unknown> | null;
  const org = (x.org ?? null) as Record<string, unknown> | null;
  const jobs = (x.jobs ?? null) as { total?: unknown; ads?: unknown } | null;
  const prev = ((f?.previous ?? null) as Record<string, unknown> | null)?.revenue;
  const rev = num(f?.revenue);
  const growth = rev !== null && typeof prev === "number" && prev > 0 ? Math.round(((rev - prev) / prev) * 100) : null;
  const reg = typeof org?.registeredAt === "string" ? Number(org.registeredAt.slice(0, 4)) : null;
  const rating = num(place?.rating);
  const adList = list(jobs?.ads).flatMap((a) => { const u = url(a.url), t = str(a.title, 120); return u && t ? [{ title: t, city: str(a.city, 60), url: u }] : []; }).slice(0, MAX_JOBS);
  const seenTech = new Set<string>();
  const tech = list(x.services).flatMap((t) => {
    const n = str(t.name, 60);
    if (!n || seenTech.has(n.toLowerCase())) return [];
    seenTech.add(n.toLowerCase());
    return [{ name: n, category: str(t.category, 40) ?? "" }];
  }).slice(0, MAX_TECH);

  const status = (STATUSES as readonly string[]).includes(r.status) ? (r.status as CardProfile["status"]) : "error";
  return {
    id: r.id,
    status,
    stageLabel: r.stage && r.stage in STAGE_LABEL ? STAGE_LABEL[r.stage as ProfileStage] : null,
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    summary: str(r.summary, 400),
    people,
    figures,
    growth,
    founded: reg && Number.isFinite(reg) ? reg : null,
    talkingPoints: list(x.talkingPoints).flatMap((c) => { const t = str(c.text, 240); return t ? [t] : []; }).slice(0, MAX_POINTS),
    rating: rating !== null && rating > 0 ? { value: rating, count: num(place?.ratingCount) } : null,
    jobs: jobs && num(jobs.total) !== null && (num(jobs.total) as number) > 0 ? { total: num(jobs.total) as number, ads: adList } : null,
    offering: list(x.offering).flatMap((c) => { const t = str(c.text, 200); return t ? [t] : []; }).slice(0, MAX_OFFERING),
    audience: str((x.audience as Record<string, unknown> | null)?.text, 200),
    tech,
    hours: (Array.isArray(place?.hours) ? (place!.hours as unknown[]) : []).flatMap((h) => { const t = str(h, 80); return t ? [t] : []; }).slice(0, 7),
    address: str(x.address, 160) ?? str(place?.address, 160),
    mapsUrl: url(place?.mapsUrl),
    social: list(x.social).flatMap((l) => { const u = url(l.url), n = str(l.network, 20); return u && n ? [{ network: n, url: u }] : []; }).slice(0, 6),
    builtBy: str((x.creator as Record<string, unknown> | null)?.name, 80),
  };
}
