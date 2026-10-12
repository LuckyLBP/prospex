import { createHash } from "node:crypto";
import { decodeEntities, extractEmails, extractPhones } from "@/lib/enrich/extract";
import { normalizeSwedishPhone } from "@/lib/enrich/phone";

// Gör en sida till kompakt text som en modell kan läsa för att hitta kontaktpersoner, oavsett hur sidan är uppbyggd.
// Radbrytningarna mellan block bevaras (namn och titel står oftast på egna rader), bilder blir numrerade markörer,
// telefon- och mejllänkar blir markörer, och mejladresser som sajten gömmer (Cloudflares e-postskydd, "namn [at] firma")
// avkodas, så att varje adress som modellen kan hänvisa till också finns i listan som koden kontrollerar mot.
// Ren och testad. Ingen modell här.

export interface PageImage {
  index: number;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface Condensed {
  url: string;
  /** Sidans text med radbrytningar och markörer ([bild N: ...], [tel: ...], [mail: ...]). */
  text: string;
  images: PageImage[];
  /** Mejladresser som finns på sidan, avkodade. Små bokstäver. */
  emails: string[];
  /** Svenska telefonnummer på sidan, som +46... */
  phones: string[];
  /** Fingeravtryck för texten, för att kunna se om sidan ändrats. */
  hash: string;
}

export const MAX_TEXT = 14_000;
const MAX_IMAGES = 40;
const MIN_IMAGE_SIDE = 48;

/** Cloudflares e-postskydd: första byten är nyckeln, resten är XOR med den. Null när det inte blir en adress. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^(?:[0-9a-f]{2}){3,}$/i.test(hex)) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out) ? out : null;
}

/** Ersätter Cloudflares gömda adresser med mailto-länkar och klartext. */
export function revealCloudflareEmails(html: string): string {
  return html
    .replace(/<a\b([^>]*?)href=["']\/cdn-cgi\/l\/email-protection#([0-9a-f]+)["']([^>]*)>/gi, (m, pre: string, hex: string, post: string) => {
      const email = decodeCfEmail(hex);
      return email ? `<a${pre} href="mailto:${email}"${post}>` : m;
    })
    .replace(/<(span|a|div|b|strong)\b[^>]*data-cfemail=["']([0-9a-f]+)["'][^>]*>[\s\S]*?<\/\1>/gi, (m, _tag: string, hex: string) => decodeCfEmail(hex) ?? m);
}

/** "namn [at] firma [dot] se", "namn (at) firma.se", "namn snabel-a firma.se" och liknande blir en adress. */
export function revealTextEmails(text: string): string {
  return text
    .replace(/\s*[[({]\s*(?:at|snabel-?a|a-?snabel)\s*[\])}]\s*/gi, "@")
    .replace(/\s+snabel-?a\s+/gi, "@")
    .replace(/\s*[[({]\s*(?:dot|punkt)\s*[\])}]\s*/gi, ".")
    .replace(/([A-Za-z0-9._%+-]+)\s+@\s+([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g, "$1@$2");
}

const absolute = (src: string, base: string): string | null => {
  try {
    return new URL(src.startsWith("//") ? `https:${src}` : src, base).toString();
  } catch {
    return null;
  }
};

const attr = (tag: string, name: string): string | null => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1] ?? null;

function imageSrc(tag: string): string | null {
  for (const a of ["src", "data-src", "data-lazy-src", "data-lazy", "data-original"]) {
    const v = attr(tag, a);
    if (v && !v.startsWith("data:")) return v;
  }
  const srcset = attr(tag, "srcset") ?? attr(tag, "data-srcset");
  return srcset?.split(",")[0]?.trim().split(/\s+/)[0] || null;
}

const SKIP_IMAGE = /logo|icon|sprite|favicon|pixel|spacer|arrow|loader|\.svg(?:\?|$)|\.gif(?:\?|$)/i;

/** Gör om en sida till kompakt, markerad text. */
export function condensePage(html: string, pageUrl: string): Condensed {
  const revealed = revealCloudflareEmails(html);
  const images: PageImage[] = [];

  let body = revealed
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|nav)\b[\s\S]*?<\/\1>/gi, " ");

  body = body.replace(/<img\b[^>]*>/gi, (tag) => {
    if (images.length >= MAX_IMAGES) return " ";
    const raw = imageSrc(tag);
    const url = raw ? absolute(decodeEntities(raw), pageUrl) : null;
    if (!url || SKIP_IMAGE.test(url)) return " ";
    const w = Number(attr(tag, "width")) || null;
    const h = Number(attr(tag, "height")) || null;
    if ((w && w < MIN_IMAGE_SIDE) || (h && h < MIN_IMAGE_SIDE)) return " ";
    if (images.some((i) => i.url === url)) return " ";
    const index = images.length + 1;
    const alt = decodeEntities(attr(tag, "alt") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    images.push({ index, url, alt, width: w, height: h });
    return `\n[bild ${index}${alt ? `: ${alt}` : ""}]\n`;
  });

  const tels = new Set<string>();
  const mails = new Set<string>();
  body = body
    .replace(/<a\b[^>]*href=["']tel:([^"']+)["'][^>]*>/gi, (_m, n: string) => {
      const p = normalizeSwedishPhone(decodeEntities(n).replace(/%20/g, " "));
      if (p) tels.add(p);
      return p ? ` [tel: ${p}] ` : " ";
    })
    .replace(/<a\b[^>]*href=["']mailto:([^"'?]+)[^"']*["'][^>]*>/gi, (_m, e: string) => {
      const email = decodeEntities(e).trim().toLowerCase();
      mails.add(email);
      return ` [mail: ${email}] `;
    });

  const text = revealTextEmails(
    decodeEntities(
      body
        .replace(/<\/?(?:div|p|li|ul|ol|br|h[1-6]|tr|td|th|section|article|header|footer|main|aside|figure|figcaption|address|dt|dd|blockquote|table|form)\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l, i, all) => l && l !== all[i - 1])
    .join("\n")
    .slice(0, MAX_TEXT);

  const emails = [...new Set([...mails, ...extractEmails(revealTextEmails(revealed), null).map((e) => e.toLowerCase())])];
  const phones = [...new Set([...tels, ...extractPhones(revealed)])];
  return { url: pageUrl, text, images, emails, phones, hash: createHash("sha1").update(text).digest("hex") };
}
