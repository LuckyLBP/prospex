import { decodeEntities } from "@/lib/enrich/extract";
import { isAllowedUrl } from "./safe-url";

// Länkar på en sida: de som hör till samma webbplats (underlag för vad AI:n får hämta) och sociala medier.
// Rent och testat.

export interface InventoryLink {
  url: string;
  text: string;
}

const SKIP_PATH = /\/(?:wp-admin|wp-login|wp-json|cart|varukorg|kassa|checkout|login|logga-in|my-account|mitt-konto|feed|xmlrpc)\b/i;
const FILE = /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|jpe?g|png|gif|webp|svg|ico|mp[34]|mov|avi|css|js|json|xml|txt)(?:\?|$)/i;
const KEYWORDS: [RegExp, number][] = [
  // Sidor med personer: team, personal, medarbetare, ledning. Högt, så att de kommer med bland de 40 länkarna.
  [/(?:^|[/\-_])(?:team|teamet|personal|medarbetare|medarbetarna|ledning|ledningsgrupp|styrelse|behandlare|terapeuter|staff|people|om-mig|vilka-ar-vi|vilka-är-vi|vilka-vi-ar|vara-medarbetare|våra-medarbetare|vart-team|vårt-team)(?:$|[/\-_?.])/i, 8],
  [/om-oss|om-foretaget|om-företaget|about|vilka-vi|foretaget|företaget/i, 10],
  [/tjanst|tjänst|service|erbjud|vad-vi-gor|vad-vi-gör|losning|lösning|produkt/i, 9],
  [/pris|prislista|paket/i, 7],
  [/referens|kund|case|projekt|portfolio/i, 6],
  [/kontakt|contact/i, 5],
  [/boka|book/i, 4],
  [/karri|jobb|career/i, 3],
];

function score(url: string, text: string): number {
  let best = 0;
  for (const [re, points] of KEYWORDS) if (re.test(url) || re.test(text)) best = Math.max(best, points);
  return best;
}

/** Högst `limit` HTML-sidor på samma webbplats, rankade efter hur sannolikt de beskriver företaget. */
export function linkInventory(html: string, baseUrl: string, boundary: string, limit = 40): InventoryLink[] {
  const seen = new Map<string, InventoryLink>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"#]*)(?:#[^"]*)?"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1]).trim();
    if (!href || /^(?:mailto|tel|javascript|sms):/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    url.hash = "";
    const abs = url.toString();
    if (!isAllowedUrl(abs, boundary) || SKIP_PATH.test(url.pathname) || FILE.test(url.pathname)) continue;
    const clean = abs.replace(/\/$/, "");
    if (clean === baseUrl.replace(/\/$/, "")) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 80);
    const key = clean.toLowerCase();
    if (!seen.has(key) || (!seen.get(key)!.text && text)) seen.set(key, { url: abs, text });
  }
  return [...seen.values()]
    .map((l, i) => ({ l, s: score(l.url, l.text), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.l);
}

export interface SocialLink {
  network: "facebook" | "instagram" | "linkedin" | "youtube" | "tiktok" | "x";
  url: string;
}

const SOCIAL: [SocialLink["network"], RegExp][] = [
  ["facebook", /^https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|tr\b|plugins|dialog|login)[^\s"'<>?#]+/i],
  ["instagram", /^https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore)[^\s"'<>?#]+/i],
  ["linkedin", /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|school)\/[^\s"'<>?#]+/i],
  ["youtube", /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[^\s"'<>?#]+/i],
  ["tiktok", /^https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>?#]+/i],
  ["x", /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share|home)[^\s"'<>?#/]+\/?$/i],
];

/** Företagets egna sociala konton: en länk per nätverk, i den ordning de förekommer. */
export function socialLinks(html: string): SocialLink[] {
  const found = new Map<string, SocialLink>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*"(https?:\/\/[^"]+)"/gi)) {
    const href = decodeEntities(m[1]).trim();
    for (const [network, re] of SOCIAL) {
      if (!found.has(network) && re.test(href)) found.set(network, { network, url: href });
    }
  }
  return [...found.values()];
}
