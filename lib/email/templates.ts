// E-postmallar i kod. Ren HTML + text, inga beroenden. Inga tankstreck i texten.

// Samma färger som appen (brand/tokens.cjs). E-post går inte via Tailwind, så värdena står här.
const INK = "#0E1116";
const CANVAS = "#F5F4F0";
const BODY = "#474B53";
const MUTED = "#5B6068";

/** Logotypen som bild: e-postprogram blockerar inbäddad SVG, så den ligger som PNG i public/brand. Utan bilden visas texten. */
const logoUrl = () => `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://prospex.se").replace(/\/$/, "")}/brand/email-logo.png`;

export type Email = { subject: string; html: string; text: string };

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(preheader: string, inner: string, footer = "Du fick det här mejlet för att någon angav din adress hos Prospex. Känner du inte igen det kan du ignorera det."): string {
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prospex</title></head>
<body style="margin:0;background:${CANVAS};font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
    <tr><td style="padding:0 0 20px;"><img src="${logoUrl()}" width="150" alt="Prospex" style="display:block;border:0;outline:none;height:auto;font-weight:700;font-size:20px;color:${INK};"></td></tr>
    <tr><td style="background:#fff;border-radius:24px;padding:32px;">${inner}</td></tr>
    <tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:${MUTED};">${footer}</td></tr>
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
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BODY};">Skriv in koden i Prospex för att logga in. Den gäller i en timme och kan bara användas en gång.</p>
       <div style="background:${CANVAS};border-radius:16px;padding:20px;text-align:center;font-size:36px;font-weight:700;letter-spacing:0.18em;font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(code)}</div>`,
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
       <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BODY};">${who} till <strong>${org}</strong> i Prospex ${roleText}. Logga in med den här e-postadressen så får du en kod, ett lösenord behövs inte.</p>
       <a href="${escapeHtml(o.loginUrl)}" style="display:inline-block;background:${INK};color:#fff;text-decoration:none;font-weight:600;font-size:14px;border-radius:999px;padding:13px 26px;">Logga in</a>`,
    ),
    text: `${o.inviter ? `${o.inviter} har bjudit in dig` : "Du har blivit inbjuden"} till ${o.orgName} i Prospex ${roleText}.\n\nLogga in med den här e-postadressen så får du en kod: ${o.loginUrl}`,
  };
}

export interface ReminderItem {
  name: string;
  /** "Kl 14:30" när återringningen har en tid, annars null. */
  when: string | null;
  phone: string | null;
}

/** Morgonmejlet med dagens återringningar. `test`: ett testmejl från inställningarna. */
export function callbackReminderEmail(o: { name: string; total: number; items: ReminderItem[]; url: string; settingsUrl: string; test?: boolean }): Email {
  const n = o.total;
  const word = n === 1 ? "återringning" : "återringningar";
  const headline = n === 0 ? "Inga återringningar idag" : `${n} ${word} idag`;
  const subject = `${o.test ? "Testmejl: " : ""}${n === 0 ? "Inga återringningar idag" : `Du har ${n} ${word} idag`}`;
  const rows = o.items
    .map((i) => `<tr><td style="padding:9px 0;border-bottom:1px solid #E7E5DF;font-size:14px;color:${INK};"><strong>${escapeHtml(i.name)}</strong>${i.when ? ` <span style="color:${MUTED};">· ${escapeHtml(i.when)}</span>` : ""}${i.phone ? `<br><span style="color:${MUTED};font-size:13px;">${escapeHtml(i.phone)}</span>` : ""}</td></tr>`)
    .join("");
  const more = n > o.items.length ? `<p style="margin:12px 0 0;font-size:13px;color:${MUTED};">och ${n - o.items.length} till.</p>` : "";
  const html = shell(
    headline,
    `<h1 style="margin:0 0 8px;font-size:22px;letter-spacing:-0.02em;">${o.test ? "Så här ser påminnelsen ut" : `God morgon, ${escapeHtml(o.name)}`}</h1>
       <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${BODY};">${n === 0 ? "Du har inga återringningar att ringa idag." : `Du har ${n} ${word} att ringa idag.`}</p>
       ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">${rows}</table>${more}` : ""}
       <a href="${escapeHtml(o.url)}" style="display:inline-block;margin-top:22px;background:${INK};color:#fff;text-decoration:none;font-weight:600;font-size:14px;border-radius:999px;padding:13px 26px;">Öppna återringningar</a>`,
    `Du får det här mejlet för att du slagit på påminnelser i Prospex. <a href="${escapeHtml(o.settingsUrl)}" style="color:${MUTED};">Stäng av dem i inställningarna</a>.`,
  );
  const text = `${o.test ? "Testmejl. " : ""}${headline}\n\n${o.items.map((i) => `- ${i.name}${i.when ? ` (${i.when})` : ""}${i.phone ? `, ${i.phone}` : ""}`).join("\n")}${n > o.items.length ? `\n- och ${n - o.items.length} till` : ""}\n\nÖppna återringningar: ${o.url}\n\nStäng av påminnelserna: ${o.settingsUrl}`;
  return { subject, html, text };
}

