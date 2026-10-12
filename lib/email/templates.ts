// E-postmallar i kod. Ren HTML + text, inga beroenden. Inga tankstreck i texten.

const INK = "#14161F";
const ORANGE = "#F26522";

export type Email = { subject: string; html: string; text: string };

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(preheader: string, inner: string): string {
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prospex</title></head>
<body style="margin:0;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f1;padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
    <tr><td style="padding:0 0 20px;"><span style="display:inline-block;background:${ORANGE};color:#fff;font-weight:700;font-size:15px;border-radius:12px;padding:10px 14px;">Prospex</span></td></tr>
    <tr><td style="background:#fff;border-radius:24px;padding:32px;">${inner}</td></tr>
    <tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:#6b7280;">Du fick det här mejlet för att någon angav din adress hos Prospex. Känner du inte igen det kan du ignorera det.</td></tr>
  </table>
</td></tr></table></body></html>`;
}

/**
 * Inloggningskod: sex siffror utan mellanslag. Sammanhängande siffror gör att dubbelklick markerar hela koden
 * och att iOS och macOS kan föreslå den i inloggningsfältet. Koden står först i ämnesraden av samma skäl.
 */
export function loginCodeEmail(code: string): Email {
  return {
    subject: `${code} är din inloggningskod till Prospex`,
    html: shell(
      `Din inloggningskod är ${code}`,
      `<h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-0.02em;">Din inloggningskod</h1>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">Skriv in koden i Prospex för att logga in. Den gäller i en timme och kan bara användas en gång.</p>
       <div style="background:#f4f4f1;border-radius:16px;padding:20px;text-align:center;font-size:36px;font-weight:700;letter-spacing:0.18em;font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(code)}</div>`,
    ),
    text: `Din inloggningskod är ${code}\n\nSkriv in koden i Prospex för att logga in. Den gäller i en timme och kan bara användas en gång.\n\nKänner du inte igen det här kan du ignorera mejlet.`,
  };
}

/** Inbjudan till ett bolag. */
export function invitationEmail(o: { orgName: string; role: "owner" | "member"; inviter?: string | null; loginUrl: string }): Email {
  const org = escapeHtml(o.orgName);
  const who = o.inviter ? `${escapeHtml(o.inviter)} har bjudit in dig` : "Du har blivit inbjuden";
  const roleText = o.role === "owner" ? "som ägare" : "som medlem";
  return {
    subject: `Du har bjudits in till ${o.orgName} i Prospex`,
    html: shell(
      `Du har bjudits in till ${o.orgName}`,
      `<h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-0.02em;">Välkommen till ${org}</h1>
       <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${who} till <strong>${org}</strong> i Prospex ${roleText}. Logga in med den här e-postadressen så får du en kod, ett lösenord behövs inte.</p>
       <a href="${escapeHtml(o.loginUrl)}" style="display:inline-block;background:${INK};color:#fff;text-decoration:none;font-weight:600;font-size:14px;border-radius:999px;padding:13px 26px;">Logga in</a>`,
    ),
    text: `${o.inviter ? `${o.inviter} har bjudit in dig` : "Du har blivit inbjuden"} till ${o.orgName} i Prospex ${roleText}.\n\nLogga in med den här e-postadressen så får du en kod: ${o.loginUrl}`,
  };
}
