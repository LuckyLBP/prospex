import { pool } from "./db";
import { joinOrg, type Role } from "./auth";
import { invitationEmail } from "./email/templates";
import { sendEmail } from "./email/send";

export class OrgError extends Error {}

const EMAIL = /^\S+@\S+\.\S+$/;
export { slugify } from "./slug";
import { slugify } from "./slug";

/** Öppnar eller stänger Företagsprofil för ett bolag. Redan skapade profiler ligger kvar men syns inte. */
export async function setProfileAccess(orgId: string, on: boolean): Promise<void> {
  await pool.query(`update organizations set profile_access = $2 where id = $1`, [orgId, on]);
}

export async function listMembers(orgId: string) {
  const { rows } = await pool.query(
    `select m.user_id, p.email, p.full_name, p.avatar_path, m.role, m.created_at,
            (select max(called_at) from call_logs cl where cl.org_id = m.org_id and cl.user_id = m.user_id) as last_call
     from memberships m join profiles p on p.user_id = m.user_id
     where m.org_id = $1 order by (m.role = 'owner') desc, p.email`,
    [orgId],
  );
  return rows as { user_id: string; email: string; full_name: string | null; avatar_path: string | null; role: Role; created_at: Date; last_call: Date | null }[];
}

export async function listInvites(orgId: string) {
  const { rows } = await pool.query(
    `select id, email, role, created_at from invitations where org_id = $1 and accepted_at is null order by created_at`,
    [orgId],
  );
  return rows as { id: string; email: string; role: Role; created_at: Date }[];
}

/** Lägger till direkt om personen redan har ett konto utan bolag, annars skapas en inbjudan som tas emot vid första inloggningen. */
export type Notify = { inviter: string | null; loginUrl: string };

export async function inviteMember(orgId: string, invitedBy: string, rawEmail: string, role: Role, notify?: Notify) {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new OrgError("Ogiltig e-postadress.");
  const org = (await pool.query(`select active, name from organizations where id = $1`, [orgId])).rows[0];
  if (!org?.active) throw new OrgError("Bolaget finns inte eller är avstängt.");

  const existing = (await pool.query(
    `select p.user_id, m.org_id from profiles p left join memberships m on m.user_id = p.user_id where p.email = $1`,
    [email],
  )).rows[0] as { user_id: string; org_id: string | null } | undefined;

  if (existing?.org_id && existing.org_id !== orgId) throw new OrgError("Adressen tillhör redan ett annat bolag.");
  if (existing?.org_id === orgId) throw new OrgError("Adressen är redan medlem.");

  if (existing) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await joinOrg(client, orgId, existing.user_id, email, role);
      await client.query("commit");
    } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
    await notifyInvited(email, org.name, role, notify);
    return "added" as const;
  }
  await pool.query(
    `insert into invitations (org_id, email, role, invited_by) values ($1,$2,$3,$4)
     on conflict (org_id, email) do update set role = excluded.role, accepted_at = null, invited_by = excluded.invited_by`,
    [orgId, email, role, invitedBy],
  );
  await notifyInvited(email, org.name, role, notify);
  return "invited" as const;
}

/** Inbjudningsmejlet är en artighet: misslyckas det är personen ändå inbjuden och kan logga in. */
async function notifyInvited(email: string, orgName: string, role: Role, notify?: Notify) {
  if (!notify) return;
  try {
    await sendEmail(email, invitationEmail({ orgName, role, inviter: notify.inviter, loginUrl: notify.loginUrl }));
  } catch (e) {
    console.error("Kunde inte skicka inbjudningsmejl", e);
  }
}

async function ownerCount(orgId: string) {
  return (await pool.query(`select count(*)::int n from memberships where org_id = $1 and role = 'owner'`, [orgId])).rows[0].n as number;
}

export async function removeMember(orgId: string, userId: string) {
  const m = (await pool.query(`select role from memberships where org_id = $1 and user_id = $2`, [orgId, userId])).rows[0];
  if (!m) return;
  if (m.role === "owner" && (await ownerCount(orgId)) <= 1) throw new OrgError("Bolaget måste ha minst en ägare.");
  await pool.query(`delete from memberships where org_id = $1 and user_id = $2`, [orgId, userId]);
  await pool.query(`delete from claims where org_id = $1 and user_id = $2`, [orgId, userId]);
}

export async function setMemberRole(orgId: string, userId: string, role: Role) {
  const m = (await pool.query(`select role from memberships where org_id = $1 and user_id = $2`, [orgId, userId])).rows[0];
  if (!m) throw new OrgError("Medlemmen finns inte.");
  if (m.role === "owner" && role !== "owner" && (await ownerCount(orgId)) <= 1) throw new OrgError("Bolaget måste ha minst en ägare.");
  await pool.query(`update memberships set role = $3 where org_id = $1 and user_id = $2`, [orgId, userId, role]);
}

export async function cancelInvite(orgId: string, inviteId: string) {
  await pool.query(`delete from invitations where id = $1 and org_id = $2 and accepted_at is null`, [inviteId, orgId]);
}

// --- Plattformsadmin --------------------------------------------------------

export async function listOrganizations() {
  const { rows } = await pool.query(
    `select o.id, o.name, o.slug, o.active, o.created_at,
            (select count(*)::int from memberships m where m.org_id = o.id) as members,
            (select count(*)::int from invitations i where i.org_id = o.id and i.accepted_at is null) as pending,
            (select count(*)::int from call_logs cl where cl.org_id = o.id and cl.called_at >= now() - interval '30 days') as calls_30d,
            (select string_agg(p.email::text, ', ') from memberships m join profiles p on p.user_id = m.user_id where m.org_id = o.id and m.role = 'owner') as owners
     from organizations o order by o.created_at`,
  );
  return rows as { id: string; name: string; slug: string; active: boolean; created_at: Date; members: number; pending: number; calls_30d: number; owners: string | null }[];
}

export async function createOrganization(name: string, ownerEmail: string, createdBy: string, notify?: Notify) {
  const clean = name.trim();
  const slug = slugify(clean);
  if (clean.length < 2 || slug.length < 2) throw new OrgError("Ange ett bolagsnamn.");
  if (!EMAIL.test(ownerEmail.trim())) throw new OrgError("Ange ägarens e-postadress.");
  const { rows } = await pool.query(`insert into organizations (name, slug) values ($1,$2) on conflict (slug) do nothing returning id`, [clean, slug]);
  if (!rows[0]) throw new OrgError("Det finns redan ett bolag med det namnet.");
  await inviteMember(rows[0].id, createdBy, ownerEmail, "owner", notify);
  return rows[0].id as string;
}

export async function setOrgActive(orgId: string, active: boolean) {
  await pool.query(`update organizations set active = $2 where id = $1`, [orgId, active]);
}

export async function listUsers() {
  const { rows } = await pool.query(
    `select p.user_id, p.email, p.is_platform_admin, p.active, p.created_at, o.name as org_name, o.id as org_id, m.role
     from profiles p left join memberships m on m.user_id = p.user_id left join organizations o on o.id = m.org_id
     order by p.is_platform_admin desc, o.name nulls last, p.email`,
  );
  const inv = await pool.query(
    `select i.id, i.email, i.role, o.name as org_name, i.created_at from invitations i join organizations o on o.id = i.org_id
     where i.accepted_at is null order by i.created_at`,
  );
  return {
    users: rows as { user_id: string; email: string; is_platform_admin: boolean; active: boolean; created_at: Date; org_name: string | null; org_id: string | null; role: Role | null }[],
    invitations: inv.rows as { id: string; email: string; role: Role; org_name: string; created_at: Date }[],
  };
}

export async function setPlatformAdmin(userId: string, admin: boolean) {
  if (!admin) {
    const n = (await pool.query(`select count(*)::int n from profiles where is_platform_admin and active and user_id <> $1`, [userId])).rows[0].n as number;
    if (n < 1) throw new OrgError("Det måste finnas minst en administratör.");
  }
  await pool.query(`update profiles set is_platform_admin = $2 where user_id = $1`, [userId, admin]);
}

export async function setUserActive(userId: string, active: boolean) {
  if (!active) {
    const target = (await pool.query(`select is_platform_admin from profiles where user_id = $1`, [userId])).rows[0];
    if (target?.is_platform_admin) {
      const n = (await pool.query(`select count(*)::int n from profiles where is_platform_admin and active and user_id <> $1`, [userId])).rows[0].n as number;
      if (n < 1) throw new OrgError("Det måste finnas minst en administratör.");
    }
  }
  await pool.query(`update profiles set active = $2 where user_id = $1`, [userId, active]);
}
