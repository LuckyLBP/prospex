"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { cleanName, makeAvatar, setAvatarPath, updateName } from "@/lib/account";
import { deleteAvatar, isAvatarStorageConfigured, uploadAvatar } from "@/lib/storage-avatars";

const back = (kind: "ok" | "error", text: string): never => redirect(`/app/profil?${kind}=${encodeURIComponent(text)}`);

export async function saveNameAction(f: FormData) {
  const m = await requireMember();
  const r = cleanName(String(f.get("name") ?? ""));
  if (!r.ok) return back("error", r.error);
  await updateName(m.user.id, r.name);
  revalidatePath("/app", "layout");
  return back("ok", "Namnet är sparat.");
}

export type AvatarResult = { ok: true } | { ok: false; error: string };

/** Tar emot en bild (förminskad i webbläsaren), gör den till ett litet porträtt och sparar den. */
export async function uploadAvatarAction(f: FormData): Promise<AvatarResult> {
  const m = await requireMember();
  if (!isAvatarStorageConfigured()) return { ok: false, error: "Lagringen är inte konfigurerad." };
  const file = f.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Välj en bild." };
  const avatar = await makeAvatar(new Uint8Array(await file.arrayBuffer()));
  if (!avatar) return { ok: false, error: "Det gick inte att använda bilden. Välj en JPG, PNG eller WebP som är minst 64 pixlar." };
  const path = `${m.user.id}-${Date.now()}.webp`;
  try {
    await uploadAvatar(path, avatar);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Kunde inte spara bilden." };
  }
  await deleteAvatar(await setAvatarPath(m.user.id, path));
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function removeAvatarAction(): Promise<AvatarResult> {
  const m = await requireMember();
  await deleteAvatar(await setAvatarPath(m.user.id, null));
  revalidatePath("/app", "layout");
  return { ok: true };
}
