import type { Detection } from "./types";

// Vad en domäns DNS-poster avslöjar: vem som hanterar e-posten, vilka tjänster som skickar e-post för den och
// var namnservrarna finns. `classifyDns` är ren; `lookupDns` är det enda som rör nätet (namnuppslag hämtar
// ingen sida och går alltså inte att använda för att nå interna adresser).

export interface DnsRecords {
  mx: string[];
  ns: string[];
  txt: string[];
  /** TXT-poster på `_dmarc.<domän>`. Utelämnat betyder att uppslaget inte gjordes. */
  dmarc?: string[];
  /** SPF-poster som SPF-posten hänvisar till med `include:`, ett steg ned. */
  spfIncludes?: string[];
  /** Var webbplatsen och e-postens autodiscover pekar. */
  hosting?: { cname: string[]; a: string[]; autodiscover: string[] };
}

const MAIL_HOSTS: [RegExp, string, string][] = [
  [/(?:^|\.)(?:aspmx\.l\.google\.com|googlemail\.com|google\.com)$/i, "mail-google", "Google Workspace"],
  [/mail\.protection\.outlook\.com$/i, "mail-microsoft", "Microsoft 365"],
  [/(?:^|\.)loopia\.se$/i, "mail-loopia", "Loopia"],
  [/(?:^|\.)one\.com$/i, "mail-onecom", "one.com"],
  [/(?:^|\.)binero\.se$/i, "mail-binero", "Binero"],
  [/(?:^|\.)zoho\.(?:com|eu)$/i, "mail-zoho", "Zoho Mail"],
];

const SPF_SENDERS: [RegExp, string, string][] = [
  [/_spf\.google\.com/i, "spf-google", "Google Workspace"],
  [/spf\.protection\.outlook\.com/i, "spf-microsoft", "Microsoft 365"],
  [/servers\.mcsv\.net/i, "spf-mailchimp", "Mailchimp"],
  [/sendgrid\.net/i, "spf-sendgrid", "SendGrid"],
  [/hubspotemail\.net|hubspot/i, "spf-hubspot", "HubSpot"],
  [/mailgun\.org/i, "spf-mailgun", "Mailgun"],
  [/mandrillapp\.com/i, "spf-mandrill", "Mailchimp Transactional (Mandrill)"],
  [/amazonses\.com/i, "spf-ses", "Amazon SES"],
  [/spf\.mailjet\.com/i, "spf-mailjet", "Mailjet"],
  [/postmarkapp\.com/i, "spf-postmark", "Postmark"],
];

const NS_HOSTS: [RegExp, string, string][] = [
  [/(?:^|\.)ns\.cloudflare\.com$/i, "ns-cloudflare", "Cloudflare"],
  [/(?:^|\.)loopia\.(?:se|com)$/i, "ns-loopia", "Loopia"],
  [/(?:^|\.)one\.com$/i, "ns-onecom", "one.com"],
  [/(?:^|\.)binero\.se$/i, "ns-binero", "Binero"],
  [/awsdns-/i, "ns-aws", "Amazon Route 53"],
  [/azure-dns\./i, "ns-azure", "Azure DNS"],
  [/(?:^|\.)googledomains\.com$/i, "ns-google", "Google Domains"],
];

/** Tjänster som lämnar ett verifieringstoken i domänens TXT-poster: [mönster, id, namn, kategori, detalj]. */
const TXT_TOKENS: [RegExp, string, string, Detection["category"], string][] = [
  [/^MS=ms\d+/i, "txt-microsoft", "Microsoft 365", "e-post", "domänverifiering"],
  [/^atlassian-domain-verification=/i, "txt-atlassian", "Atlassian", "säljverktyg", "domänverifiering"],
  [/^apple-domain-verification=/i, "txt-apple", "Apple", "domän", "domänverifiering"],
  [/^docusign=/i, "txt-docusign", "DocuSign", "säljverktyg", "domänverifiering"],
  [/^zoom-domain-verification=|^ZOOM_verify_/i, "txt-zoom", "Zoom", "chatt", "domänverifiering"],
  [/^adobe-idp-site-verification=/i, "txt-adobe", "Adobe", "säljverktyg", "domänverifiering"],
  [/^stripe-verification=/i, "txt-stripe", "Stripe", "betalning", "domänverifiering"],
  [/^miro-verification=/i, "txt-miro", "Miro", "säljverktyg", "domänverifiering"],
  [/^dropbox-domain-verification=/i, "txt-dropbox", "Dropbox", "säljverktyg", "domänverifiering"],
  [/^webexdomainverification\./i, "txt-webex", "Webex", "chatt", "domänverifiering"],
  [/^(?:hubspot|hs)-domain-verification=|^hubspot-developer-verification=/i, "txt-hubspot", "HubSpot", "marknadsautomation", "domänverifiering"],
  [/^zendesk_verification|^zendeskverification/i, "txt-zendesk", "Zendesk", "chatt", "domänverifiering"],
  [/^pardot\d*=/i, "txt-pardot", "Salesforce Pardot", "marknadsautomation", "domänverifiering"],
  [/^salesforce-.*verification|^sf-domain-verification=/i, "txt-salesforce", "Salesforce", "säljverktyg", "domänverifiering"],
  [/^mailchimp=|^mandrill_verify/i, "txt-mailchimp", "Mailchimp", "marknadsautomation", "domänverifiering"],
  [/^klaviyo-site-verification=/i, "txt-klaviyo", "Klaviyo", "marknadsautomation", "domänverifiering"],
  [/^brevo-code:|^sendinblue-code:/i, "txt-brevo", "Brevo", "marknadsautomation", "domänverifiering"],
  [/^postmark-verification|^[a-f0-9]{16,}\._domainkey.*postmarkapp/i, "txt-postmark", "Postmark", "e-post", "domänverifiering"],
  [/^amazonses:/i, "txt-ses", "Amazon SES", "e-post", "domänverifiering"],
  [/^shopify-verification-code=/i, "txt-shopify", "Shopify", "e-handel", "domänverifiering"],
  [/^canva-site-verification=/i, "txt-canva", "Canva", "säljverktyg", "domänverifiering"],
  [/^slack-domain-verification=/i, "txt-slack", "Slack", "chatt", "domänverifiering"],
];

/** Vem som hostar webbplatsen, utifrån CNAME-mål och kända IP-adresser: [mönster, id, namn]. */
const HOST_CNAMES: [RegExp, string, string][] = [
  [/(?:^|\.)vercel-dns\.com$|(?:^|\.)vercel\.app$/i, "host-vercel", "Vercel"],
  [/(?:^|\.)netlify\.(?:app|com)$|(?:^|\.)netlifydns\.com$/i, "host-netlify", "Netlify"],
  [/(?:^|\.)wixdns\.net$|(?:^|\.)wix\.com$|(?:^|\.)wixsite\.com$/i, "host-wix", "Wix"],
  [/(?:^|\.)squarespace\.com$|(?:^|\.)sqsp\.net$/i, "host-squarespace", "Squarespace"],
  [/(?:^|\.)myshopify\.com$|(?:^|\.)shops\.myshopify\.com$/i, "host-shopify", "Shopify"],
  [/(?:^|\.)wordpress\.com$|(?:^|\.)wpcomstaging\.com$/i, "host-wpcom", "WordPress.com"],
  [/(?:^|\.)one\.com$/i, "host-onecom", "one.com"],
  [/(?:^|\.)loopia\.se$/i, "host-loopia", "Loopia"],
  [/(?:^|\.)binero\.se$/i, "host-binero", "Binero"],
  [/(?:^|\.)cloudfront\.net$|(?:^|\.)amazonaws\.com$/i, "host-aws", "Amazon Web Services"],
  [/(?:^|\.)azurewebsites\.net$|(?:^|\.)azureedge\.net$|(?:^|\.)trafficmanager\.net$/i, "host-azure", "Microsoft Azure"],
  [/(?:^|\.)webflow\.io$|(?:^|\.)proxy-ssl\.webflow\.com$/i, "host-webflow", "Webflow"],
  [/(?:^|\.)ghost\.io$/i, "host-ghost", "Ghost"],
  [/(?:^|\.)hubspot(?:-?hosting)?\.net$|(?:^|\.)hs-sites\.com$/i, "host-hubspot", "HubSpot"],
];

const HOST_IPS: [RegExp, string, string][] = [
  [/^76\.76\.(?:19|21)\./, "host-vercel", "Vercel"],
  [/^75\.2\.60\.5$|^99\.83\.190\.102$/, "host-netlify", "Netlify"],
  [/^185\.230\.63\./, "host-wix", "Wix"],
  [/^198\.185\.159\.|^198\.49\.23\./, "host-squarespace", "Squarespace"],
  [/^23\.227\.38\./, "host-shopify", "Shopify"],
];

/** Vem som är värd för en IP-adress, om den är en känd plattform eller ett känt webbhotell. Ren. */
export function knownHostForIp(ip: string): { id: string; name: string } | null {
  const hit = HOST_IPS.find(([re]) => re.test(ip));
  return hit ? { id: hit[1], name: hit[2] } : null;
}

const DMARC_POLICY = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\b/i;

export function classifyDns(rec: DnsRecords): Detection[] {
  const out: Detection[] = [];
  const seen = new Set<string>();
  const add = (d: Detection) => {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      out.push(d);
    }
  };

  for (const host of rec.mx) {
    for (const [re, id, name] of MAIL_HOSTS) if (re.test(host.trim().replace(/\.$/, ""))) add({ id, name, category: "e-post", detail: "e-postserver", match: `MX ${host}` });
  }
  for (const line of rec.txt) {
    if (/^v=spf1\b/i.test(line)) {
      for (const [re, id, name] of SPF_SENDERS) {
        const hit = re.exec(line);
        if (hit) add({ id, name, category: "e-post", detail: "får skicka e-post för domänen", match: `SPF ${hit[0]}` });
      }
    }
    if (/^google-site-verification=/i.test(line)) add({ id: "txt-google-verify", name: "Google Search Console", category: "analys", detail: "domänverifiering", match: "TXT google-site-verification" });
    if (/^facebook-domain-verification=/i.test(line)) add({ id: "txt-meta-verify", name: "Meta Business", category: "annonsering", detail: "domänverifiering", match: "TXT facebook-domain-verification" });
  }
  for (const line of rec.txt) for (const [re, id, name, category, detail] of TXT_TOKENS) if (re.test(line)) add({ id, name, category, detail, match: `TXT ${line.slice(0, 40)}` });
  // En SPF-post som hänvisar vidare: det som står där är också sådant som får skicka för domänen.
  for (const line of rec.spfIncludes ?? []) {
    for (const [re, id, name] of SPF_SENDERS) {
      const hit = re.exec(line);
      if (hit) add({ id, name, category: "e-post", detail: "får skicka e-post för domänen", match: `SPF include ${hit[0]}` });
    }
  }
  if (rec.dmarc) {
    const policy = rec.dmarc.map((l) => /^v=DMARC1\b/i.test(l.trim()) ? DMARC_POLICY.exec(l)?.[1]?.toLowerCase() : undefined).find((x) => x);
    if (policy) add({ id: "dmarc", name: "DMARC", category: "e-post", detail: `policy ${policy}${policy === "none" ? " (ingen kontroll)" : ""}`, match: "TXT _dmarc" });
    else if (rec.mx.length > 0) add({ id: "dmarc-missing", name: "Saknar DMARC", category: "e-post", detail: "inget skydd mot förfalskad avsändare", match: "TXT _dmarc saknas" });
  }
  const hosting = rec.hosting;
  if (hosting) {
    for (const target of hosting.cname) for (const [re, id, name] of HOST_CNAMES) if (re.test(target.replace(/\.$/, ""))) add({ id, name, category: "drift", detail: "webbhotell", match: `CNAME ${target}` });
    for (const ip of hosting.a) for (const [re, id, name] of HOST_IPS) if (re.test(ip)) add({ id, name, category: "drift", detail: "webbhotell", match: `A ${ip}` });
    for (const target of hosting.autodiscover) if (/outlook\.com$/i.test(target.replace(/\.$/, ""))) add({ id: "mail-microsoft", name: "Microsoft 365", category: "e-post", detail: "e-postserver", match: `CNAME autodiscover ${target}` });
  }
  for (const host of rec.ns) {
    for (const [re, id, name] of NS_HOSTS) if (re.test(host.trim().replace(/\.$/, ""))) add({ id, name, category: "domän", detail: "namnserver", match: `NS ${host}` });
  }
  return out;
}

async function within<T>(promise: Promise<T>, fallback: T, ms = 3000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const SPF_INCLUDE = /\binclude:([^\s]+)/gi;
const MAX_SPF_INCLUDES = 5;

export async function lookupDns(domain: string): Promise<DnsRecords> {
  const dns = await import("node:dns/promises");
  const txtOf = (name: string) => within(dns.resolveTxt(name).then((r) => r.map((chunks) => chunks.join(""))), [] as string[]);
  const [mx, ns, txt, dmarc, wwwCname, apexA, autodiscover] = await Promise.all([
    within(dns.resolveMx(domain).then((r) => r.sort((a, b) => a.priority - b.priority).map((x) => x.exchange)), [] as string[]),
    within(dns.resolveNs(domain), [] as string[]),
    txtOf(domain),
    txtOf(`_dmarc.${domain}`),
    within(dns.resolveCname(`www.${domain}`), [] as string[]),
    within(dns.resolve4(domain), [] as string[]),
    within(dns.resolveCname(`autodiscover.${domain}`), [] as string[]),
  ]);
  // SPF-poster som SPF-posten hänvisar till, högst ett steg ned och högst fem uppslag.
  const includes = txt.filter((l) => /^v=spf1\b/i.test(l)).flatMap((l) => [...l.matchAll(SPF_INCLUDE)].map((m) => m[1])).slice(0, MAX_SPF_INCLUDES);
  const spfIncludes = (await Promise.all(includes.map((h) => txtOf(h)))).flat().filter((l) => /^v=spf1\b/i.test(l));
  return { mx, ns, txt, dmarc, spfIncludes: [...includes.map((h) => `include:${h}`), ...spfIncludes], hosting: { cname: wwwCname, a: apexA, autodiscover } };
}
