import { CollectorError } from "./types";
import { normalizeDomain } from "./domain";
import { reverseLookup, type ViewdnsDeps } from "./viewdns";

// HackerTarget reverse IP: gratis och utan nyckel (cirka 50 uppslag per dygn och avsändaradress), som reserv när ViewDNS
// saknar nyckel eller svarar 429. Svaret är vanlig text, en domän per rad, eller en felrad.
//
//   error check your search parameter           felaktig adress
//   API count exceeded - Increase Quota ...     dagens gratiskvot är slut
//   No DNS A records found                      inget hittades (ingen fel)

const BASE = "https://api.hackertarget.com/reverseiplookup/";
const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** Exporterad för test: ett svar från HackerTarget som domänlista. Kastar på en felrad. Ren. */
export function parseReverseIp(text: string): string[] {
  const body = text.trim();
  if (/^no (?:dns a records|records) found/i.test(body)) return [];
  if (/api count exceeded/i.test(body)) throw new CollectorError("HackerTarget: dagens gratiskvot är slut.");
  if (/^error/i.test(body)) throw new CollectorError(`HackerTarget: ${body.slice(0, 120)}`);
  const out = new Set<string>();
  for (const line of body.split(/\r?\n/)) {
    const d = normalizeDomain(line.trim());
    if (d) out.add(d);
  }
  return [...out];
}

export async function hackerTargetReverseIp(ip: string, signal: AbortSignal, fetchFn: typeof globalThis.fetch = globalThis.fetch): Promise<string[]> {
  if (!IPV4.test(ip)) throw new CollectorError("HackerTarget: bara IPv4-adresser går att slå upp.");
  let res: Response;
  try {
    res = await fetchFn(`${BASE}?q=${ip}`, { signal, headers: { Accept: "text/plain" } });
  } catch (cause) {
    throw new CollectorError(`Kunde inte nå HackerTarget: ${cause instanceof Error ? cause.message : "okänt fel"}`);
  }
  if (!res.ok) throw new CollectorError(`HackerTarget svarade ${res.status}.`);
  return parseReverseIp(await res.text());
}

/**
 * Domänerna på en IP-adress. ViewDNS först när en nyckel finns, och HackerTarget när nyckeln saknas eller ViewDNS
 * felar (kvoten slut, 429). `source` säger vilken som svarade, så att körningens anteckningar kan visa det.
 */
export async function reverseIp(
  ip: string,
  ctx: { signal: AbortSignal; log: (message: string) => void },
  deps: { viewdns?: ViewdnsDeps; fetch?: typeof globalThis.fetch } = {},
): Promise<{ domains: string[]; source: "viewdns" | "hackertarget" }> {
  const key = deps.viewdns ? deps.viewdns.apiKey : process.env.VIEWDNS_API_KEY;
  if (key) {
    try {
      const page = await reverseLookup("reverseip", ip, 1, 1, ctx, deps.viewdns);
      return { domains: page.domains, source: "viewdns" };
    } catch (e) {
      ctx.log(`ViewDNS gav inget för ${ip} (${e instanceof Error ? e.message : "okänt fel"}): provar HackerTarget`);
    }
  }
  ctx.log(`HackerTarget reverse IP ${ip}`);
  return { domains: await hackerTargetReverseIp(ip, ctx.signal, deps.fetch), source: "hackertarget" };
}
