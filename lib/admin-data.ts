import { pool } from "./db";
import { describeNextRefresh } from "./runs/schedule";
import { listSources, type AdminSource } from "./lists-admin";
import { lastCollectBySupplier, latestRuns, type RunRow } from "./runs/store";

// Läsfrågor för adminportalens översikt, bolags- och användarsidor och insamlingsstatus.

export type CollectionRow = AdminSource & { next: string; late: boolean; run: RunRow | null; lastCollect: string | null };

/** Publicerade källor med senaste körning, när de hämtades senast och när nästa hämtning väntas. */
export async function getCollectionRows(): Promise<CollectionRow[]> {
  const now = new Date();
  const [sources, runs, last] = await Promise.all([listSources(), latestRuns(), lastCollectBySupplier()]);
  return sources
    .filter((s) => s.published && s.method)
    .map((s) => {
      const lastCollect = last.get(s.id) ?? null;
      const d = describeNextRefresh(lastCollect, now, s.method ?? undefined);
      return { ...s, next: d.label, late: d.late, run: runs.get(s.id) ?? null, lastCollect };
    });
}

export async function adminNavCounts(): Promise<{ invites: number; late: number }> {
  const [inv, req, rows] = await Promise.all([
    pool.query(`select count(*)::int n from invitations i join organizations o on o.id = i.org_id where i.accepted_at is null and o.active`),
    pool.query(`select count(*)::int n from access_requests where handled_at is null`),
    getCollectionRows(),
  ]);
  // Märket vid Användare räknar både väntande inbjudningar och obehandlade förfrågningar om åtkomst.
  return { invites: (inv.rows[0].n as number) + (req.rows[0].n as number), late: rows.filter((r) => r.late).length };
}

export async function getOverview() {
  const { rows } = await pool.query(`
    select
      (select count(*)::int from organizations where active) as orgs,
      (select count(*)::int from profiles where active) as users,
      (select count(*)::int from companies) as companies,
      (select count(*)::int from call_logs where called_at > now() - interval '7 days') as calls_7d,
      (select count(*)::int from invitations i join organizations o on o.id = i.org_id where i.accepted_at is null and o.active) as pending_invites,
      (select count(*)::int from organizations o where o.active and not exists (select 1 from memberships m where m.org_id = o.id and m.role = 'owner')
         and not exists (select 1 from invitations i where i.org_id = o.id and i.role = 'owner' and i.accepted_at is null)) as orgs_without_owner,
      (select count(*)::int from suppliers where not published) as unpublished_sources,
      (select count(*)::int from suppliers where published and logo_path is null) as missing_logos,
      (select count(distinct r.supplier_id)::int from list_requests r join suppliers s on s.id = r.supplier_id where not s.published) as open_list_requests
  `);
  return rows[0] as { orgs: number; users: number; companies: number; calls_7d: number; pending_invites: number; orgs_without_owner: number; unpublished_sources: number; missing_logos: number; open_list_requests: number };
}

export async function getOrganizationBySlug(slug: string) {
  const { rows } = await pool.query(
    `select o.id, o.name, o.slug, o.active, o.profile_access, o.list_access, o.created_at,
            (select count(*)::int from call_logs cl where cl.org_id = o.id and cl.called_at >= now() - interval '30 days') as calls_30d,
            (select count(*)::int from contacts k where k.org_id = o.id) as contacts
     from organizations o where o.slug = $1`,
    [slug],
  );
  return (rows[0] as { id: string; name: string; slug: string; active: boolean; profile_access: boolean; list_access: boolean; created_at: Date; calls_30d: number; contacts: number } | undefined) ?? null;
}

export type AdminUser = {
  user_id: string; email: string; is_platform_admin: boolean; active: boolean; created_at: Date;
  org_id: string | null; org_name: string | null; org_slug: string | null; role: "owner" | "member" | null; last_sign_in: Date | null;
};

const USER_SELECT = `
  select p.user_id, p.email, p.is_platform_admin, p.active, p.created_at, o.id as org_id, o.name as org_name, o.slug as org_slug, m.role, u.last_sign_in_at as last_sign_in
  from profiles p
  join auth.users u on u.id = p.user_id
  left join memberships m on m.user_id = p.user_id
  left join organizations o on o.id = m.org_id`;

export async function listAdminUsers(): Promise<AdminUser[]> {
  const { rows } = await pool.query(`${USER_SELECT} order by p.is_platform_admin desc, o.name nulls last, p.email`);
  return rows as AdminUser[];
}

export async function getAdminUser(id: string): Promise<AdminUser | null> {
  const { rows } = await pool.query(`${USER_SELECT} where p.user_id = $1`, [id]);
  return (rows[0] as AdminUser | undefined) ?? null;
}
