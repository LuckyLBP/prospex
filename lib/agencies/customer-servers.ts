import { promises as dns } from "node:dns";
import { classifyDns } from "@/lib/profile/dns";
import { reverseIp } from "@/lib/scrapers/hackertarget";
import { normalizeDomain } from "@/lib/scrapers/domain";

// Byråns kunder ligger ofta på samma server, och byrån har ofta lagt dem där själv. Har två eller flera bekräftade kunder
// samma IP-adress slår vi upp vilka andra sajter som ligger där. Träffarna är bara förslag: varje sajt måste visa byråns
// kredit på sin egen sida, och "samma server"-regeln (agency.ts) godkänner bara servrar med högst 60 domäner, så en
// stor delad server ger aldrig en kund utan kredit. Jo Kommunikations egna kunder ligger till exempel på en delad
// Loopia-server med över 500 sajter, och uppslaget där hittade två kunder som inget annat hade hittat.

/** Så många bekräftade kunder ska dela servern för att den är värd ett uppslag. */
export const MIN_CUSTOMERS_PER_SERVER = 2;
/** Så många servrar slås upp per körning. Den gratis tjänsten har en liten dygnskvot. */
export const MAX_CUSTOMER_SERVERS = 3;
/** Så många kunder får sin adress uppslagen per körning. */
export const MAX_CUSTOMERS_RESOLVED = 60;
/** Så många sajter per server tas med som kandidater. */
export const MAX_SERVER_SITES = 600;

export interface ServerGroup {
  ip: string;
  customers: string[];
}

/** Kunderna grupperade per IP, de med flest först, och bara de med minst MIN_CUSTOMERS_PER_SERVER. Ren. */
export function groupByServer(ipOf: ReadonlyMap<string, string>): ServerGroup[] {
  const groups = new Map<string, string[]>();
  for (const [domain, ip] of ipOf) groups.set(ip, [...(groups.get(ip) ?? []), domain]);
  return [...groups]
    .map(([ip, customers]) => ({ ip, customers: customers.sort() }))
    .filter((g) => g.customers.length >= MIN_CUSTOMERS_PER_SERVER)
    .sort((a, b) => b.customers.length - a.customers.length || a.ip.localeCompare(b.ip));
}

/** Är adressen en känd tjänst (molnleverantör, CDN) där tusentals orelaterade sajter delar IP? Ren. */
export function isKnownHost(ip: string): boolean {
  return classifyDns({ mx: [], ns: [], txt: [], hosting: { cname: [], a: [ip], autodiscover: [] } }).some((d) => d.id.startsWith("host-"));
}

/** Ett registrerat domännamn, inte en underdomän (kund.se, inte test.kund.se). Ren. */
export const isRegistrable = (host: string): boolean => host.split(".").length <= 2;

export interface ServerHit {
  domain: string;
  server: { ip: string; size: number };
}

export interface CustomerServerDeps {
  resolve4: (host: string) => Promise<string[]>;
  reverseIp: typeof reverseIp;
}
export const defaultCustomerServerDeps: CustomerServerDeps = { resolve4: (h) => dns.resolve4(h), reverseIp };

/**
 * Sajterna på servrarna där minst två av byråns kunder ligger. Kunderna själva och byråns egen domän tas bort, liksom
 * underdomäner. Ger inget belägg: verifieringen avgör.
 */
export async function customerServerHits(
  agencyDomain: string,
  customers: readonly string[],
  ctx: { signal: AbortSignal; log: (message: string) => void },
  deps: CustomerServerDeps = defaultCustomerServerDeps,
): Promise<ServerHit[]> {
  const ipOf = new Map<string, string>();
  const list = customers.slice(0, MAX_CUSTOMERS_RESOLVED);
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < list.length) {
        const domain = list[next++];
        const ips = await deps.resolve4(domain).catch(() => deps.resolve4(`www.${domain}`).catch(() => [] as string[]));
        if (ips[0]) ipOf.set(domain, ips[0]);
      }
    }),
  );

  const own = new Set(customers);
  const out: ServerHit[] = [];
  const seen = new Set<string>();
  for (const group of groupByServer(ipOf).filter((g) => !isKnownHost(g.ip)).slice(0, MAX_CUSTOMER_SERVERS)) {
    ctx.log(`Servern ${group.ip} har ${group.customers.length} av byråns kunder: slår upp vilka andra sajter som ligger där`);
    const { domains } = await deps.reverseIp(group.ip, ctx);
    const sites = [...new Set(domains.map((d) => normalizeDomain(d)).filter((d): d is string => !!d && isRegistrable(d)))].filter((d) => !own.has(d) && d !== agencyDomain && !d.endsWith(`.${agencyDomain}`));
    for (const domain of sites.slice(0, MAX_SERVER_SITES)) {
      if (seen.has(domain)) continue;
      seen.add(domain);
      out.push({ domain, server: { ip: group.ip, size: domains.length } });
    }
  }
  return out;
}
