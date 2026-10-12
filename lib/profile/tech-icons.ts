import * as simple from "simple-icons";

// Varumärkesikoner för teknik och tjänster i profilen, ur simple-icons (MIT). Kartan går från detektorns id, eller
// från namnet för CMS och byggare, till ikonens namn i paketet. Saknas en ikon (några varumärken finns inte i
// paketet) visas en initialruta i stället. Ren.

type Icon = { title: string; hex: string; path: string };
const ICONS = simple as unknown as Record<string, Icon | undefined>;

/** Detektor-id (detectors.ts, dns.ts, facts.ts) till ikonnamn. */
export const ICON_BY_ID: Record<string, string> = {
  ga4: "siGoogleanalytics", ua: "siGoogleanalytics", gtm: "siGoogletagmanager", gads: "siGoogleads", meta: "siMeta", tiktok: "siTiktok", snap: "siSnapchat",
  pinterest: "siPinterest", hotjar: "siHotjar", matomo: "siMatomo", plausible: "siPlausibleanalytics", mailchimp: "siMailchimp", hubspot: "siHubspot",
  intercom: "siIntercom", zendesk: "siZendesk", woocommerce: "siWoocommerce", prestashop: "siPrestashop", klarna: "siKlarna", stripe: "siStripe",
  paypal: "siPaypal", trustpilot: "siTrustpilot", recaptcha: "siGoogle", nextjs: "siNextdotjs", nuxt: "siNuxt", gatsby: "siGatsby",
  cloudflare: "siCloudflare", vercel: "siVercel", netlify: "siNetlify", wpengine: "siWpengine", kinsta: "siKinsta", php: "siPhp", "wp-plugins": "siWordpress",
  "mail-google": "siGoogle", "spf-google": "siGoogle", "txt-google-verify": "siGooglesearchconsole", "txt-meta-verify": "siMeta", "ns-cloudflare": "siCloudflare",
  "spf-mailchimp": "siMailchimp", "spf-hubspot": "siHubspot", "spf-mailgun": "siMailgun",
};

/** Namn (gemener) till ikonnamn, för det `auditSite` hittat: CMS, byggare och bokningssystem. */
export const ICON_BY_NAME: Record<string, string> = {
  wordpress: "siWordpress", elementor: "siElementor", wix: "siWix", shopify: "siShopify", squarespace: "siSquarespace", webflow: "siWebflow", joomla: "siJoomla", drupal: "siDrupal",
  calendly: "siCalendly", "yoast seo": "siYoast", facebook: "siFacebook", instagram: "siInstagram", youtube: "siYoutube", tiktok: "siTiktok", x: "siX",
};

export interface BrandIcon {
  title: string;
  hex: string;
  path: string;
}

export function brandIcon(ref: { id?: string | null; name?: string | null }): BrandIcon | null {
  const key = (ref.id && ICON_BY_ID[ref.id]) || (ref.name && ICON_BY_NAME[ref.name.toLowerCase().split(/[\s,(]/)[0]]) || (ref.name && ICON_BY_NAME[ref.name.toLowerCase()]) || null;
  const icon = key ? ICONS[key] : undefined;
  return icon ? { title: icon.title, hex: icon.hex, path: icon.path } : null;
}

/** En stabil färg per namn för initialrutan, i portalens dämpade stil. */
export function initialTile(name: string): { letter: string; bg: string; fg: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { letter: (name.trim()[0] ?? "?").toUpperCase(), bg: `hsl(${h} 35% 92%)`, fg: `hsl(${h} 40% 32%)` };
}
