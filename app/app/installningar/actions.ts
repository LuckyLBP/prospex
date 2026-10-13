"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { parsePrefs, savePrefs } from "@/lib/account";
import { sendReminder } from "@/lib/reminders";
import { baseUrl } from "@/lib/url";

const back = (kind: "ok" | "error", text: string): never => redirect(`/app/installningar?${kind}=${encodeURIComponent(text)}`);

export async function saveSettingsAction(f: FormData) {
  const m = await requireMember();
  const prefs = parsePrefs({ order: f.get("order") as string | null, template: f.get("template") as string | null, callbackEmail: f.get("callback_email") as string | null });
  await savePrefs(m.user.id, prefs);
  revalidatePath("/app/ring");
  return back("ok", "Inställningarna är sparade.");
}

/** Skickar påminnelsen till dig nu, så att du ser hur den ser ut och att mejlet kommer fram. */
export async function sendTestReminderAction() {
  const m = await requireMember();
  try {
    await sendReminder({ userId: m.user.id, orgId: m.org.id, email: m.user.email, name: m.user.name }, await baseUrl(), { test: true });
  } catch (e) {
    return back("error", e instanceof Error && /RESEND_API_KEY/.test(e.message) ? "Mejlutskicket är inte konfigurerat." : "Det gick inte att skicka testmejlet. Försök igen om en stund.");
  }
  return back("ok", `Ett testmejl är skickat till ${m.user.email}.`);
}
