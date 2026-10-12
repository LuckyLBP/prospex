"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";
import { adminEmails, getUserOrNull } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { loginCodeEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { clientIp, takeAttempt } from "@/lib/ratelimit";

const EMAIL = /^\S+@\S+\.\S+$/;

/** Har adressen åtkomst, eller en väntande inbjudan? Annars skickas ingen kod. */
async function isKnown(email: string): Promise<boolean> {
  if (adminEmails().includes(email)) return true;
  const { rows } = await pool.query(
    `select 1 from profiles where email = $1 and active
     union all select 1 from invitations i join organizations o on o.id = i.org_id where i.email = $1 and i.accepted_at is null and o.active
     limit 1`,
    [email],
  );
  return rows.length > 0;
}

/** Steg 1: skicka en sexsiffrig kod. Svarar likadant oavsett om adressen är känd (ingen kartläggning av konton). */
export async function sendCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) redirect("/login?error=email");

  // Gränsen gäller alla adresser, kända eller inte, så svaret avslöjar inget om vilka konton som finns.
  const rate = await takeAttempt("send", email, await clientIp());
  if (!rate.ok) redirect(`/login?email=${encodeURIComponent(email)}&error=rate-send&wait=${rate.retryAfterSec}`);

  if (await isKnown(email)) {
    const admin = adminClient();
    if (admin) {
      // Koden skapas här och skickas med vår egen mall via Resend, inte med Supabases mejl.
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const code = data?.properties?.email_otp;
      if (error || !code) redirect(`/login?error=${encodeURIComponent((error?.message ?? "Kunde inte skapa kod").slice(0, 120))}`);
      if (!/^\d{6}$/.test(code)) {
        // Supabase-projektet är inställt på en annan kodlängd. Skicka inte en kod som inte går att skriva in.
        console.error(`Supabase skapade en kod med ${code.length} siffror. Sätt "Email OTP Length" till 6 under Authentication.`);
        redirect("/login?error=config");
      }
      try {
        await sendEmail(email, loginCodeEmail(code));
      } catch (e) {
        console.error("Kunde inte skicka inloggningskod", e);
        redirect("/login?error=send");
      }
    } else {
      // Ingen hemlig nyckel konfigurerad: låt Supabase skicka mejlet.
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) redirect(`/login?error=${encodeURIComponent(error.message.slice(0, 120))}`);
    }
  }
  redirect(`/login?email=${encodeURIComponent(email)}`);
}

/** Steg 2: verifiera koden och starta sessionen. */
export async function verifyCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\D/g, "");
  if (!EMAIL.test(email)) redirect("/login");
  if (token.length !== 6) redirect(`/login?email=${encodeURIComponent(email)}&error=code`);

  const rate = await takeAttempt("verify", email, await clientIp());
  if (!rate.ok) redirect(`/login?email=${encodeURIComponent(email)}&error=rate-verify&wait=${rate.retryAfterSec}`);

  // Redan inloggad (till exempel en dubbel inskickning): gå vidare i stället för att förbruka koden en gång till.
  if (await getUserOrNull()) redirect("/app");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    console.error(`verifyOtp misslyckades (${error.code ?? error.status}): ${error.message}`);
    redirect(`/login?email=${encodeURIComponent(email)}&error=code`);
  }
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
