import { BlockList, isIP } from "node:net";

// Skydd mot SSRF för allt som hämtar en adress någon annan har angett eller länkat till (webbplatsen i en
// profil, och sidor som AI:n väljer). Rent och testbart: själva namnuppslaget och omdirigeringarna hanteras
// i safe-fetch.ts, som anropar det här på varje adress.

const blocked = new BlockList();
const v4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];
for (const [net, prefix] of v4) blocked.addSubnet(net, prefix, "ipv4");
const v6: [string, number][] = [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96]];
for (const [net, prefix] of v6) blocked.addSubnet(net, prefix, "ipv6");

/** Är adressen en vanlig, offentlig adress? IPv4-adresser inbäddade i IPv6 (::ffff:x) bedöms som IPv4. */
export function isPublicAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPublicAddress(mapped[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const family = isIP(ip);
  if (family === 0) return false;
  return !blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** Domänen utan inledande www, i gemener. Gränsen en profil får hämta inom. */
export function boundaryOf(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

/** Samma domän eller en underdomän till den. `example.se.evil.com` och `evilexample.se` är inte det. */
export function withinBoundary(host: string, boundary: string): boolean {
  const h = boundaryOf(host);
  const b = boundaryOf(boundary);
  return h === b || h.endsWith(`.${b}`);
}

/**
 * Får den här adressen hämtas för en profil vars webbplats är `boundary`? Bara http och https, inga
 * användaruppgifter i adressen, bara port 80 och 443, ingen IP-adress som värd, och bara den egna domänen.
 * WHATWG-tolkningen gör att `http://2130706433/` blir `127.0.0.1` och därmed avvisas.
 */
export function isAllowedUrl(raw: string, boundary: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) return false;
  return withinBoundary(host, boundary);
}

/**
 * Får den här adressen hämtas som en bild eller annan resurs? Som `isAllowedUrl`, men utan domängräns: en
 * logotyp ligger ofta på en CDN. Namnuppslaget i safe-fetch.ts avgör ändå att adressen är offentlig.
 */
export function isAllowedPublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) return false;
  return host.includes(".") && !/\.(?:local|localhost|internal|lan|home|corp|intranet)$/i.test(host);
}
