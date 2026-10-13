import { cache } from "react";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { createClient } from "./supabase/server";
import { pool } from "./db";

export type Role = "owner" | "member";
export type User = { id: string; email: string; name: string; avatarPath?: string | null };
export type Org = { id: string; name: string; slug: string };
export type Access = { user: User; org: Org | null; role: Role | null; isAdmin: boolean };

/** Plattformsadmins som bootstrap-listas i miljön (komma-separerade e-postadresser). */
export const adminEmails = () =>
  (process.env.PROSPEX_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Verifierad användare från sessionscookien, eller null. */
export const getUserOrNull = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const email = data.user.email ?? "";
  const local = email.split("@")[0] ?? "";
  const name = local ? local.charAt(0).toUpperCase() + local.slice(1) : "Du";
  return { id: data.user.id, email, name };
});

export async function requireUser(): Promise<User> {
  const user = await getUserOrNull();
  if (!user) redirect("/login");
  return user;
}

/** Lägger en användare i ett bolag och kopplar importerad historik (som bara har e-post) till kontot. */
export async function joinOrg(client: PoolClient, orgId: string, userId: string, email: string, role: Role) {
  await client.query(
    `insert into memberships (org_id, user_id, role) values ($1,$2,$3)
     on conflict (org_id, user_id) do update set role = excluded.role`,
    [orgId, userId, role],
  );
  await client.query(`update call_logs set user_id = $1 where org_id = $2 and user_id is null and lower(user_email) = $3`, [userId, orgId, email.toLowerCase()]);
  await client.query(`update contacts set last_called_by = $1 where org_id = $2 and last_called_by is null and lower(last_called_by_email) = $3`, [userId, orgId, email.toLowerCase()]);
}

async function loadAccess(user: User): Promise<Access> {
  const email = user.email.toLowerCase();
  const boot = adminEmails().includes(email);

  const { rows: pr } = await pool.query(
    `insert into profiles (user_id, email, is_platform_admin) values ($1,$2,$3)
     on conflict (user_id) do update set email = excluded.email,
       is_platform_admin = profiles.is_platform_admin or excluded.is_platform_admin
     returning is_platform_admin, active, full_name, avatar_path`,
    [user.id, email, boot],
  );
  const profile = pr[0] as { is_platform_admin: boolean; active: boolean; full_name: string | null; avatar_path: string | null };
  if (!profile.active) return { user, org: null, role: null, isAdmin: false };
  const named = { ...user, name: profile.full_name || user.name, avatarPath: profile.avatar_path };

  const lookup = async () =>
    (await pool.query(
      `select o.id, o.name, o.slug, m.role from memberships m join organizations o on o.id = m.org_id
       where m.user_id = $1 and o.active`,
      [user.id],
    )).rows[0] as (Org & { role: Role }) | undefined;

  let m = await lookup();
  if (!m) {
    // Första inloggningen för en inbjuden: ta emot inbjudan.
    const { rows } = await pool.query(
      `select i.id, i.org_id, i.role from invitations i join organizations o on o.id = i.org_id
       where i.email = $1 and i.accepted_at is null and o.active order by i.created_at limit 1`,
      [email],
    );
    if (rows[0]) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await joinOrg(client, rows[0].org_id, user.id, email, rows[0].role);
        await client.query(`update invitations set accepted_at = now() where id = $1`, [rows[0].id]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
      m = await lookup();
    }
  }
  return {
    user: named,
    org: m ? { id: m.id, name: m.name, slug: m.slug } : null,
    role: m?.role ?? null,
    isAdmin: profile.is_platform_admin,
  };
}

/** För route handlers: ingen redirect, null om ingen inloggad. */
export const getAccessOrNull = cache(async (): Promise<Access | null> => {
  const user = await getUserOrNull();
  return user ? loadAccess(user) : null;
});

export const getAccess = cache(async (): Promise<Access> => {
  const user = await requireUser();
  return loadAccess(user);
});

export type Member = { user: User; org: Org; role: Role; isAdmin: boolean };

/** Bolagssidan: kräver medlemskap i ett aktivt bolag. */
export async function requireMember(): Promise<Member> {
  const a = await getAccess();
  if (!a.org || !a.role) redirect(a.isAdmin ? "/admin" : "/no-access");
  return { user: a.user, org: a.org, role: a.role, isAdmin: a.isAdmin };
}

/** Bolagets ägare (eller plattformsadmin som också är medlem). */
export async function requireOwner(): Promise<Member> {
  const m = await requireMember();
  if (m.role !== "owner" && !m.isAdmin) redirect("/app");
  return m;
}

/** Har bolaget fått Företagsprofil öppnad av en admin? */
export async function orgHasProfileAccess(orgId: string): Promise<boolean> {
  const { rows } = await pool.query(`select profile_access from organizations where id = $1 and active`, [orgId]);
  return rows[0]?.profile_access === true;
}

/** Företagsprofilen för bolag: kräver medlemskap i ett bolag som en admin öppnat den för. */
export async function requireProfileAccess(): Promise<Member> {
  const m = await requireMember();
  if (!(await orgHasProfileAccess(m.org.id))) redirect("/app");
  return m;
}

export async function requireAdmin(): Promise<Access> {
  const a = await getAccess();
  if (!a.isAdmin) redirect(a.org ? "/app" : "/no-access");
  return a;
}
