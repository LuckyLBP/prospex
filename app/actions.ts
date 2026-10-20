"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { pool } from "@/lib/db";
import { accessRequestEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { clientIp, takeAttempt } from "@/lib/ratelimit";

const Form = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().max(200).regex(/^\S+@\S+\.\S+$/),
  company: z.string().trim().min(1).max(160),
  message: z.string().trim().max(1000).optional(),
});

/** Dit förfrågningarna mejlas. Kan bytas med ACCESS_REQUEST_TO (kommaseparerad lista). */
const recipients = () => (process.env.ACCESS_REQUEST_TO ?? "lucas@pohlare.com").split(",").map((e) => e.trim()).filter(Boolean);

const back = (status: string, wait?: number) => redirect(`/?atkomst=${status}${wait ? `&wait=${wait}` : ""}#atkomst`);

/** Startsidans formulär: någon ber om åtkomst. Sparas i databasen och mejlas till administratörerna. */
export async function requestAccess(formData: FormData) {
  // Dolt fält som bara en bot fyller i. Svara som om det gick bra, utan att spara något.
  if (String(formData.get("website") ?? "")) back("skickad");

  const parsed = Form.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
    message: String(formData.get("message") ?? "") || undefined,
  });
  if (!parsed.success) back("fel");
  const f = parsed.data!;

  const ip = await clientIp();
  const rate = await takeAttempt("request", f.email, ip);
  if (!rate.ok) back("vanta", rate.retryAfterSec);

  await pool.query(`insert into access_requests (name, email, company, message, ip) values ($1,$2,$3,$4,$5)`, [f.name, f.email, f.company, f.message ?? null, ip]);

  // Raden är sparad. Misslyckas mejlet syns förfrågan ändå i admin.
  const adminUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://prospex.se").replace(/\/$/, "")}/admin/anvandare`;
  const mail = accessRequestEmail({ ...f, adminUrl });
  await Promise.all(
    recipients().map((to) => sendEmail(to, mail).catch((e) => console.error("Kunde inte mejla förfrågan om åtkomst", e))),
  );
  back("skickad");
}
