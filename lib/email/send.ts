import type { Email } from "./templates";

/** Avsändaren. Domänen måste vara verifierad hos Resend. */
const from = () => process.env.EMAIL_FROM || "Prospex <no-reply@prospex.se>";

export class EmailError extends Error {}

export async function sendEmail(to: string, mail: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new EmailError("RESEND_API_KEY saknas");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: from(), to, subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new EmailError(`Resend ${res.status}: ${body.message ?? "okänt fel"}`);
  }
}
