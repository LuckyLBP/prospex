"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { baseUrl } from "@/lib/url";
import { cancelInvite, inviteMember, OrgError, removeMember, setMemberRole } from "@/lib/orgs";

const back = (q = "") => redirect(`/app/team${q}`);
const fail = (e: unknown) => { if (e instanceof OrgError) back(`?error=${encodeURIComponent(e.message)}`); throw e; };

export async function inviteAction(formData: FormData) {
  const m = await requireOwner();
  const role = formData.get("role") === "owner" ? "owner" : "member";
  try { await inviteMember(m.org.id, m.user.id, String(formData.get("email") ?? ""), role, { inviter: m.user.name, loginUrl: `${await baseUrl()}/login` }); } catch (e) { fail(e); }
  revalidatePath("/app/team");
  back();
}

export async function removeMemberAction(formData: FormData) {
  const m = await requireOwner();
  try { await removeMember(m.org.id, String(formData.get("user_id") ?? "")); } catch (e) { fail(e); }
  revalidatePath("/app/team");
  back();
}

export async function roleAction(formData: FormData) {
  const m = await requireOwner();
  const role = formData.get("role") === "owner" ? "owner" : "member";
  try { await setMemberRole(m.org.id, String(formData.get("user_id") ?? ""), role); } catch (e) { fail(e); }
  revalidatePath("/app/team");
  back();
}

export async function cancelInviteAction(formData: FormData) {
  const m = await requireOwner();
  await cancelInvite(m.org.id, String(formData.get("id") ?? ""));
  revalidatePath("/app/team");
  back();
}
