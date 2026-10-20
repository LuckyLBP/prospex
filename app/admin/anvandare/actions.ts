"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { pool } from "@/lib/db";
import { OrgError, setPlatformAdmin, setUserActive } from "@/lib/orgs";

const UUID = /^[0-9a-f-]{36}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

async function onUser(f: FormData, ok: string, fn: (u: { id: string; email: string }) => Promise<void>) {
  const id = str(f, "user_id");
  if (!UUID.test(id)) return;
  const u = (await pool.query(`select user_id as id, email from profiles where user_id = $1`, [id])).rows[0] as { id: string; email: string } | undefined;
  if (!u) redirect("/admin/anvandare?error=Användaren%20finns%20inte.");
  const back = `/admin/anvandare/${u.id}`;
  try {
    await fn(u);
  } catch (e) {
    if (e instanceof OrgError) redirect(`${back}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/admin", "layout");
  redirect(`${back}?ok=${encodeURIComponent(ok)}`);
}

export async function toggleAdminAction(f: FormData) {
  const a = await requireAdmin();
  const admin = f.get("admin") === "1";
  await onUser(f, admin ? "Användaren är nu plattformsadmin." : "Adminrättigheterna togs bort.", async (u) => {
    await setPlatformAdmin(u.id, admin);
    await audit(a.user, admin ? "user.admin_grant" : "user.admin_revoke", "user", { id: u.id, name: u.email, details: { email: u.email } });
  });
}

export async function toggleUserAction(f: FormData) {
  const a = await requireAdmin();
  const active = f.get("active") === "1";
  await onUser(f, active ? "Användaren är aktiverad." : "Användaren är avstängd.", async (u) => {
    await setUserActive(u.id, active);
    await audit(a.user, active ? "user.activate" : "user.deactivate", "user", { id: u.id, name: u.email, details: { email: u.email } });
  });
}

/** Markerar en förfrågan om åtkomst från startsidan som hanterad. */
export async function handleRequestAction(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  if (!UUID.test(id)) return;
  const { rows } = await pool.query(`update access_requests set handled_at = now() where id = $1 and handled_at is null returning email, company`, [id]);
  if (rows[0]) await audit(a.user, "request.handle", "request", { id, name: rows[0].company, details: { email: rows[0].email } });
  revalidatePath("/admin", "layout");
  redirect("/admin/anvandare?ok=Förfrågan%20markerad%20som%20hanterad.");
}
