export type IcsEvent = {
  id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  note: string | null;
  phone: string | null;
  url: string | null;
  updated_at: Date;
};

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** RFC 5545: rader max 75 oktetter, fortsättning börjar med mellanslag. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    const max = out.length === 0 ? 75 : 74;
    if (len + l > max) { out.push(cur); cur = ch; len = l; } else { cur += ch; len += l; }
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(events: IcsEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prospex//Kalender//SV", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Prospex", "X-WR-TIMEZONE:Europe/Stockholm", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of events) {
    const desc = [e.phone ? `Telefon: ${e.phone}` : null, e.note].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@prospex`,
      `DTSTAMP:${stamp(e.updated_at)}`,
      `LAST-MODIFIED:${stamp(e.updated_at)}`,
      `DTSTART:${stamp(e.starts_at)}`,
      `DTEND:${stamp(e.ends_at)}`,
      `SUMMARY:${esc(e.title)}`,
    );
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
