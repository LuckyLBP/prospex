"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { pool } from "@/lib/db";
import { baseUrl } from "@/lib/url";
import { cancelInvite, createOrganization, inviteMember, OrgError, removeMember, setMemberRole, setOrgActive, setProfileAccess } from "@/lib/orgs";
import { slugify } from "@/lib/slug";

const UUID = /^[0-9a-f-]{36}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const roleOf = (f: FormData) => (f.get("role") === "owner" ? ("owner" as const) : ("member" as const));

async function org(id: string) {
  const { rows } = await pool.query(`select id, name, slug from organizations where id = $1`, [id]);
  return rows[0] as { id: string; name: string; slug: string } | undefined;
}

/** Kör en åtgärd på ett bolag och går tillbaka till dess sida med ett besked. */
async function onOrg(f: FormData, ok: string, fn: (o: { id: string; name: string; slug: string }, loginUrl: string) => Promise<void>) {
  const id = str(f, "org_id");
  if (!UUID.test(id)) return;
  const o = await org(id);
  if (!o) redirect("/admin/bolag?error=Bolaget%20finns%20inte.");
  const back = `/admin/bolag/${o.slug}`;
  try {
    await fn(o, `${await baseUrl()}/login`);
  } catch (e) {
    if (e instanceof OrgError) redirect(`${back}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
  redirect(`${back}?ok=${encodeURIComponent(ok)}`);
}

export async function createOrgAction(f: FormData) {
  const a = await requireAdmin();
  const name = str(f, "name");
  const owner = str(f, "owner_email");
  try {
    await createOrganization(name, owner, a.user.id, { inviter: null, loginUrl: `${await baseUrl()}/login` });
    await audit(a.user, "org.create", "org", { id: slugify(name.trim()), name: name.trim(), details: { owner: owner.trim().toLowerCase() } });
  } catch (e) {
    if (e instanceof OrgError) redirect(`/admin/bolag/ny?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/bolag/${slugify(name.trim())}?ok=${encodeURIComponent("Bolaget skapades och ägaren är inbjuden.")}`);
}

export async function toggleOrgAction(f: FormData) {
  const a = await requireAdmin();
  const active = f.get("active") === "1";
  await onOrg(f, active ? "Bolaget är aktiverat." : "Bolaget är avstängt.", async (o) => {
    await setOrgActive(o.id, active);
    await audit(a.user, active ? "org.activate" : "org.deactivate", "org", { id: o.slug, name: o.name });
  });
}

export async function toggleProfileAccessAction(f: FormData) {
  const a = await requireAdmin();
  const on = f.get("on") === "1";
  await onOrg(f, on ? "Spaning är öppnad för bolaget." : "Spaning är stängd för bolaget.", async (o) => {
    await setProfileAccess(o.id, on);
    await audit(a.user, on ? "org.profile_access_on" : "org.profile_access_off", "org", { id: o.slug, name: o.name });
  });
}

export async function inviteMemberAction(f: FormData) {
  const a = await requireAdmin();
  const email = str(f, "email").trim().toLowerCase();
  const role = roleOf(f);
  await onOrg(f, "Klart.", async (o, loginUrl) => {
    const result = await inviteMember(o.id, a.user.id, email, role, { inviter: null, loginUrl });
    await audit(a.user, result === "added" ? "member.add" : "member.invite", "org", { id: o.slug, name: o.name, details: { email, role, org: o.name } });
  });
}

export async function roleAction(f: FormData) {
  const a = await requireAdmin();
  const userId = str(f, "user_id");
  const role = roleOf(f);
  if (!UUID.test(userId)) return;
  await onOrg(f, "Rollen ändrades.", async (o) => {
    const cur = (await pool.query(`select m.role, p.email from memberships m join profiles p on p.user_id = m.user_id where m.org_id = $1 and m.user_id = $2`, [o.id, userId])).rows[0];
    await setMemberRole(o.id, userId, role);
    if (cur && cur.role !== role) await audit(a.user, "member.role", "org", { id: o.slug, name: o.name, details: { email: cur.email, org: o.name, from: cur.role, to: role } });
  });
}

export async function removeMemberAction(f: FormData) {
  const a = await requireAdmin();
  const userId = str(f, "user_id");
  if (!UUID.test(userId)) return;
  await onOrg(f, "Medlemmen togs bort.", async (o) => {
    const cur = (await pool.query(`select p.email from profiles p where p.user_id = $1`, [userId])).rows[0];
    await removeMember(o.id, userId);
    await audit(a.user, "member.remove", "org", { id: o.slug, name: o.name, details: { email: cur?.email ?? userId, org: o.name } });
  });
}

export async function cancelInviteAction(f: FormData) {
  const a = await requireAdmin();
  const inviteId = str(f, "invite_id");
  if (!UUID.test(inviteId)) return;
  await onOrg(f, "Inbjudan avbröts.", async (o) => {
    const cur = (await pool.query(`select email from invitations where id = $1 and org_id = $2`, [inviteId, o.id])).rows[0];
    await cancelInvite(o.id, inviteId);
    if (cur) await audit(a.user, "invite.cancel", "invite", { id: o.slug, name: o.name, details: { email: cur.email, org: o.name } });
  });
}
