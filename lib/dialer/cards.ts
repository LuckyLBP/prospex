import { pool } from "../db";
import { readSiteAudit, siteIssues } from "../enrich/audit";
import { seoImprovements } from "../enrich/seo";
import type { CallOutcome } from "../calls/outcomes";
import { signPhotoUrls } from "../storage-people";
import { cardProfile, type ProfileRowForCard } from "./card-profile";
import type { DialerCard, CardRegistry, CardSite } from "./card-types";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

function buildSite(raw: unknown, outdated: boolean | null): CardSite {
  const audit = readSiteAudit(raw);
  if (!audit) return { analysed: false, outdated: null, issues: [], facts: [], seo: [] };
  const facts: string[] = [];
  if (audit.cms) facts.push(`Byggd med ${audit.cms}${audit.builder ? ` (${audit.builder})` : ""}${audit.cmsVersion ? ` ${audit.cmsVersion}` : ""}`);
  if (audit.credit) facts.push(`Byggd av ${audit.credit}`);
  else if (audit.theme && audit.cms === "WordPress") facts.push(`Tema: ${audit.theme}`);
  if (audit.booking) facts.push(`Bokning: ${audit.booking}`);
  const seo = audit.seo ? seoImprovements(audit.seo).filter((s) => s.priority === "high").slice(0, 3).map(({ label, detail }) => ({ label, detail })) : [];
  return { analysed: true, outdated, issues: siteIssues(audit), facts, seo };
}

function buildRegistry(org: Record<string, unknown> | null): CardRegistry | null {
  if (!org) return null;
  const sni = (org.sni as { label?: string }[] | undefined)?.[0]?.label ?? null;
  const reg = typeof org.registeredAt === "string" ? Number(org.registeredAt.slice(0, 4)) : null;
  const desc = typeof org.description === "string" ? org.description.replace(/\s+/g, " ").trim() : null;
  return {
    active: typeof org.active === "boolean" ? org.active : null,
    legalForm: (org.legalForm as { label?: string } | null)?.label ?? null,
    registeredYear: reg && Number.isFinite(reg) ? reg : null,
    description: desc ? (desc.length > 220 ? `${desc.slice(0, 217)}...` : desc) : null,
    sni,
    proceedings: Array.isArray(org.proceedings) ? org.proceedings.length : 0,
    advertisingBlocked: org.advertisingBlocked === true,
  };
}

/** Kort för ringläget, i samma ordning som `ids`. Allt bolagsspecifikt (kontakt, samtal) är för `orgId`. */
export async function getCards(orgId: string, ids: string[]): Promise<DialerCard[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query(
    `select c.id, c.name, c.phone, c.email, c.website, c.orgnr, c.site_audit, c.site_outdated,
            c.registry->'organisation' as org,
            c.registry->'organisation'->'address'->>'city' as city,
            coalesce((select json_agg(json_build_object('supplier', s.name, 'logo', s.logo_path, 'kind', s.kind, 'icon', k.icon, 'names_brand', coalesce(k.names_brand, s.kind = 'supplier'), 'source_url', cs.source_url) order by (s.kind = 'supplier') desc, s.name)
                      from company_signals cs join suppliers s on s.id = cs.supplier_id and s.published left join list_categories k on k.id = s.category_id
                      where cs.company_id = c.id), '[]') as signals,
            (select row_to_json(k) from (
               select outcome, note, last_called_at, last_called_by_email, call_count, next_callback_at, callback_has_time, meeting_at,
                      (archived_at is not null) as archived
               from contacts where org_id = $1 and company_id = c.id) k) as contact,
            coalesce((select json_agg(l order by l.called_at desc) from (
               select outcome, note, called_at, user_email, callback_at, meeting_at from call_logs
               where org_id = $1 and company_id = c.id order by called_at desc limit 40) l), '[]') as logs,
            coalesce((select json_agg(n order by n.created_at desc) from (
               select id, body, created_at, user_email from company_notes
               where org_id = $1 and company_id = c.id order by created_at desc limit 40) n), '[]') as notes,
            (select row_to_json(x) from (
               select p.id, p.status, p.stage, p.finished_at, p.profile->'overview'->>'summary' as summary,
                      p.profile->'contact'->'people' as people, p.profile->'registry'->'figures' as figures
               from company_profiles p join profile_org_access a on a.profile_id = p.id and a.org_id = $1
               where p.company_id = c.id or p.target_company_id = c.id
               order by (p.status in ('queued','running')) desc, coalesce(p.finished_at, p.created_at) desc limit 1) x) as profile
     from companies c where c.id = any($2::uuid[])`,
    [orgId, ids],
  );
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const canScan = ((await pool.query(`select profile_access from organizations where id = $1 and active`, [orgId])).rows[0]?.profile_access as boolean | undefined) === true;
  // Porträtten ligger i en privat bucket och visas via signerade länkar som gäller en timme.
  const paths = rows.flatMap((r) => ((r.profile?.people ?? []) as { photoPath?: string }[]).map((p) => p.photoPath).filter((x): x is string => !!x));
  const signed = canScan && paths.length ? await signPhotoUrls(paths) : new Map<string, string>();
  return ids.flatMap((id): DialerCard[] => {
    const r = byId.get(id);
    if (!r) return [];
    const k = r.contact as Record<string, unknown> | null;
    const logs = (r.logs as Record<string, unknown>[]).map((l) => ({
      outcome: l.outcome as CallOutcome,
      note: (l.note as string | null) ?? null,
      calledAt: iso(l.called_at as string)!,
      userEmail: l.user_email as string,
      callbackAt: iso(l.callback_at as string | null),
      meetingAt: iso(l.meeting_at as string | null),
    }));
    return [{
      id: r.id, name: r.name, phone: r.phone, email: r.email, website: r.website, orgnr: r.orgnr, city: r.city,
      signals: r.signals,
      contact: k && k.outcome !== undefined && (k.outcome !== null || k.archived)
        ? {
            outcome: (k.outcome as CallOutcome | null) ?? null,
            note: (k.note as string | null) ?? null,
            lastCalledAt: iso(k.last_called_at as string | null),
            lastCalledByEmail: (k.last_called_by_email as string | null) ?? null,
            callCount: Number(k.call_count ?? 0),
            nextCallbackAt: iso(k.next_callback_at as string | null),
            callbackHasTime: k.callback_has_time === true,
            meetingAt: iso(k.meeting_at as string | null),
            archived: k.archived === true,
          }
        : null,
      logs,
      notes: (r.notes as Record<string, unknown>[]).map((n) => ({ id: n.id as string, body: n.body as string, createdAt: iso(n.created_at as string)!, userEmail: n.user_email as string })),
      site: buildSite(r.site_audit, r.site_outdated),
      registry: buildRegistry(r.org),
      canScan,
      profile: canScan && r.profile ? cardProfile(r.profile as ProfileRowForCard, signed) : null,
    }];
  });
}
