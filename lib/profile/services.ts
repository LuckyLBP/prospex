import type { Confidence, Fact, ServiceCategory, ServiceItem } from "./types";

// Från belagda fakta till "tjänster de kan ha köpt". Säkerheten sätts av regeln och aldrig av en modell, och
// formuleringen säger vad som setts, inte vad företaget betalar. Rent.
//
//   stark   tjänsten används tydligt, och brukar vara köpt (webbbyggare med abonnemang, bokningssystem,
//           e-handelsplattform, betalning, utskickstjänst, e-post hos en leverantör)
//   trolig  det finns ett tecken på tjänsten (annonsspårning, byråns signatur, hosting)
//   svag    antydan, till exempel ett tema som liknar en byrå (används inte av reglerna ännu)

interface Rule {
  name: string;
  supplier: string | null;
  category: ServiceCategory;
  confidence: Confidence;
  basis: string;
}

const own = (name: string, category: ServiceCategory, confidence: Confidence, basis: string, supplier: string | null = name): Rule => ({ name, supplier, category, confidence, basis });

const ADS = "Spårningskoden finns på webbplatsen, vilket tyder på att företaget kan annonsera där.";
const MAIL = "Utskickstjänsten finns på webbplatsen.";
const CHAT = "Chattverktyget finns på webbplatsen.";
const SHOP = "E-handelsplattformen används av webbplatsen.";
const PAY = "Betalningslösningen finns på webbplatsen.";
const CONSENT = "Verktyget för samtycke till cookies finns på webbplatsen.";
const HOST = "Svarshuvudena visar att webbplatsen körs hos leverantören.";
const MX = "E-postservern för domänen finns hos leverantören.";

/** Regler per detektor-id. Id:n kommer från detectors.ts, dns.ts och facts.ts. */
const BY_DETECTOR: Record<string, Rule> = {
  meta: own("Meta (annonsspårning)", "annonsering", "trolig", ADS, "Meta"),
  gads: own("Google Ads (annonsspårning)", "annonsering", "trolig", ADS, "Google"),
  linkedin: own("LinkedIn (annonsspårning)", "annonsering", "trolig", ADS, "LinkedIn"),
  tiktok: own("TikTok (annonsspårning)", "annonsering", "trolig", ADS, "TikTok"),
  snap: own("Snapchat (annonsspårning)", "annonsering", "trolig", ADS, "Snapchat"),
  pinterest: own("Pinterest (annonsspårning)", "annonsering", "trolig", ADS, "Pinterest"),
  bing: own("Microsoft Advertising", "annonsering", "trolig", ADS, "Microsoft"),
  "txt-meta-verify": own("Meta Business (domänverifiering)", "annonsering", "trolig", "Domänen är verifierad hos Meta Business, vilket tyder på annonskonto.", "Meta"),
  hotjar: own("Hotjar", "analys", "stark", "Analysverktyget finns på webbplatsen."),
  leadinfo: own("Leadinfo", "analys", "stark", "Verktyget för att se besökande företag finns på webbplatsen."),
  leadfeeder: own("Leadfeeder", "analys", "stark", "Verktyget för att se besökande företag finns på webbplatsen."),
  hubspot: own("HubSpot", "övrigt", "stark", "HubSpots kod för marknadsföring och formulär finns på webbplatsen."),
  mailchimp: own("Mailchimp", "e-post", "stark", MAIL),
  activecampaign: own("ActiveCampaign", "e-post", "stark", MAIL),
  klaviyo: own("Klaviyo", "e-post", "stark", MAIL),
  rule: own("Rule", "e-post", "stark", MAIL),
  getanewsletter: own("Get a Newsletter", "e-post", "stark", MAIL),
  intercom: own("Intercom", "chatt", "stark", CHAT),
  tawk: own("Tawk.to", "chatt", "stark", CHAT),
  zendesk: own("Zendesk", "chatt", "stark", CHAT),
  tidio: own("Tidio", "chatt", "stark", CHAT),
  crisp: own("Crisp", "chatt", "stark", CHAT),
  woocommerce: own("WooCommerce", "e-handel", "stark", SHOP),
  magento: own("Magento", "e-handel", "stark", SHOP),
  prestashop: own("PrestaShop", "e-handel", "stark", SHOP),
  abicart: own("Abicart", "e-handel", "stark", SHOP),
  quickbutik: own("Quickbutik", "e-handel", "stark", SHOP),
  starweb: own("Starweb", "e-handel", "stark", SHOP),
  wikinggruppen: own("Wikinggruppen", "e-handel", "stark", SHOP),
  ecwid: own("Ecwid", "e-handel", "stark", SHOP),
  klarna: own("Klarna", "betalning", "stark", PAY),
  stripe: own("Stripe", "betalning", "stark", PAY),
  paypal: own("PayPal", "betalning", "stark", PAY),
  qliro: own("Qliro", "betalning", "stark", PAY),
  cookiebot: own("Cookiebot", "övrigt", "stark", CONSENT),
  cookieyes: own("CookieYes", "övrigt", "stark", CONSENT),
  onetrust: own("OneTrust", "övrigt", "stark", CONSENT),
  complianz: own("Complianz", "övrigt", "stark", CONSENT),
  cookieinfo: own("Cookie Information", "övrigt", "stark", CONSENT),
  usercentrics: own("Usercentrics", "övrigt", "stark", CONSENT),
  trustpilot: own("Trustpilot", "övrigt", "stark", "Omdömeswidgeten finns på webbplatsen."),
  reco: own("Reco", "övrigt", "stark", "Omdömeswidgeten finns på webbplatsen."),
  cloudflare: own("Cloudflare", "drift", "trolig", HOST),
  vercel: own("Vercel", "drift", "trolig", HOST),
  netlify: own("Netlify", "drift", "trolig", HOST),
  wpengine: own("WP Engine", "drift", "trolig", HOST),
  kinsta: own("Kinsta", "drift", "trolig", HOST),
  "mail-google": own("Google Workspace", "e-post", "stark", MX),
  "mail-microsoft": own("Microsoft 365", "e-post", "stark", MX),
  "mail-loopia": own("Loopia (e-post)", "e-post", "stark", MX, "Loopia"),
  "mail-onecom": own("one.com (e-post)", "e-post", "stark", MX, "one.com"),
  "mail-binero": own("Binero (e-post)", "e-post", "stark", MX, "Binero"),
  "mail-zoho": own("Zoho Mail", "e-post", "stark", MX, "Zoho"),
  "spf-mailchimp": own("Mailchimp", "e-post", "stark", "Mailchimp får skicka e-post för domänen."),
  "spf-hubspot": own("HubSpot", "övrigt", "stark", "HubSpot får skicka e-post för domänen."),
  "spf-sendgrid": own("SendGrid", "e-post", "stark", "SendGrid får skicka e-post för domänen."),
  "spf-mailgun": own("Mailgun", "e-post", "stark", "Mailgun får skicka e-post för domänen."),
  "spf-mailjet": own("Mailjet", "e-post", "stark", "Mailjet får skicka e-post för domänen."),
  "spf-postmark": own("Postmark", "e-post", "stark", "Postmark får skicka e-post för domänen."),
  "spf-ses": own("Amazon SES", "e-post", "stark", "Amazon SES får skicka e-post för domänen.", "Amazon"),
  "ns-cloudflare": own("Cloudflare", "drift", "trolig", "Domänens namnservrar finns hos Cloudflare."),
};

/** Webbyggare där plattformen i sig är en betald tjänst. Nyckeln är värdet från CMS-detektorn, i gemener. */
const BUILDERS: Record<string, string> = { wix: "Wix", squarespace: "Squarespace", shopify: "Shopify", webflow: "Webflow", jimdo: "Jimdo", weebly: "Weebly", "mono (eniro)": "Mono (Eniro)" };

export function servicesFromFacts(facts: Fact[]): ServiceItem[] {
  const out: ServiceItem[] = [];
  const seen = new Set<string>();
  const push = (item: ServiceItem) => {
    const key = `${item.supplier ?? item.name}|${item.category}`.toLowerCase();
    if (seen.has(key)) {
      // Ett andra belägg för samma tjänst läggs till på den första, om det inte redan är med.
      const existing = out.find((o) => `${o.supplier ?? o.name}|${o.category}`.toLowerCase() === key);
      for (const e of item.evidence) if (existing && !existing.evidence.includes(e)) existing.evidence.push(e);
      return;
    }
    seen.add(key);
    out.push(item);
  };

  for (const f of facts) {
    const det = f.detector;
    if (!det) continue;

    if (det.startsWith("cms:")) {
      const label = BUILDERS[det.slice(4)];
      if (label) push({ name: label, supplier: label, category: "webbplats", basis: "Webbplatsen är byggd på plattformen.", confidence: "stark", evidence: [f.id], origin: "regel" });
      continue;
    }
    if (det === "credit") {
      push({ name: `Webbplats av ${f.value}`, supplier: f.value, category: "webbplats", basis: "Sidfoten anger vem som gjort webbplatsen.", confidence: "trolig", evidence: [f.id], origin: "regel" });
      continue;
    }
    if (det.startsWith("booking:")) {
      push({ name: f.value, supplier: f.value, category: "bokning", basis: "Bokningssystemet länkas eller är inbäddat på webbplatsen.", confidence: "stark", evidence: [f.id], origin: "regel" });
      continue;
    }
    const rule = BY_DETECTOR[det];
    if (rule) push({ name: rule.name, supplier: rule.supplier, category: rule.category, basis: rule.basis, confidence: rule.confidence, evidence: [f.id], origin: "regel" });
  }
  return out;
}
