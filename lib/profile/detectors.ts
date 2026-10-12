import type { Detection, TechCategory } from "./types";

// Teknik och spår som syns i en sidas HTML eller svarshuvuden. Rent: ingen nätverksåtkomst, så varje detektor
// går att testa med ett utdrag. Det som `auditSite` (lib/enrich/audit.ts) redan hittar, som CMS, byggare, tema,
// bokningssystem och byråns signatur, görs inte om här, utan blir fakta av sitt eget resultat.
//
// En detektor säger bara att något finns på sidan, inte att företaget betalar för det eller använder det bra.

interface HtmlDetector {
  id: string;
  name: string;
  category: TechCategory;
  test: RegExp;
}

const d = (id: string, name: string, category: TechCategory, test: RegExp): HtmlDetector => ({ id, name, category, test });

export const HTML_DETECTORS: HtmlDetector[] = [
  d("ga4", "Google Analytics 4", "analys", /gtag\/js\?id=G-[A-Z0-9]{6,}|['"]G-[A-Z0-9]{8,}['"]/),
  d("ua", "Universal Analytics", "analys", /\bUA-\d{4,}-\d+\b|google-analytics\.com\/analytics\.js/),
  d("gtm", "Google Tag Manager", "analys", /googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]{4,}\b/),
  d("gads", "Google Ads", "annonsering", /gtag\/js\?id=AW-|['"]AW-\d{8,}|googleadservices\.com\/pagead\/conversion/),
  d("meta", "Meta-pixel", "annonsering", /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init/),
  d("linkedin", "LinkedIn Insight Tag", "annonsering", /snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/),
  d("tiktok", "TikTok-pixel", "annonsering", /analytics\.tiktok\.com\/i18n\/pixel|\bttq\.load\(/),
  d("snap", "Snapchat-pixel", "annonsering", /sc-static\.net\/scevent\.min\.js|\bsnaptr\(/),
  d("pinterest", "Pinterest-tagg", "annonsering", /s\.pinimg\.com\/ct\/core\.js|\bpintrk\(/),
  d("bing", "Microsoft Advertising", "annonsering", /bat\.bing\.com\/bat\.js/),
  d("clarity", "Microsoft Clarity", "analys", /clarity\.ms\/tag/),
  d("hotjar", "Hotjar", "analys", /static\.hotjar\.com|\b_hjSettings\b/),
  d("matomo", "Matomo", "analys", /matomo\.js|piwik\.js|\b_paq\.push\(/),
  d("plausible", "Plausible", "analys", /plausible\.io\/js/),
  d("leadinfo", "Leadinfo", "säljverktyg", /cdn\.leadinfo\.net/),
  d("leadfeeder", "Leadfeeder", "säljverktyg", /sc\.lfeeder\.com|\blftracker\b/),
  d("cookiebot", "Cookiebot", "samtycke", /consent\.cookiebot\.com/),
  d("cookieyes", "CookieYes", "samtycke", /cdn-cookieyes\.com/),
  d("onetrust", "OneTrust", "samtycke", /cdn\.cookielaw\.org|\botSDKStub\b/),
  d("complianz", "Complianz", "samtycke", /\/plugins\/complianz-gdpr\//),
  d("cookieinfo", "Cookie Information", "samtycke", /cookieinformation\.com/),
  d("usercentrics", "Usercentrics", "samtycke", /usercentrics\.eu/),
  d("hubspot", "HubSpot", "marknadsautomation", /js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net/),
  d("mailchimp", "Mailchimp", "e-post", /chimpstatic\.com|list-manage\.com/),
  d("activecampaign", "ActiveCampaign", "e-post", /trackcmp\.net|\.activehosted\.com/),
  d("klaviyo", "Klaviyo", "e-post", /static\.klaviyo\.com/),
  d("rule", "Rule", "e-post", /(?:\/\/|\.)(?:app\.|cdn\.)?rule\.io\b/),
  d("getanewsletter", "Get a Newsletter", "e-post", /getanewsletter\.com/),
  d("intercom", "Intercom", "chatt", /widget\.intercom\.io|\bintercomSettings\b/),
  d("tawk", "Tawk.to", "chatt", /embed\.tawk\.to/),
  d("zendesk", "Zendesk", "chatt", /static\.zdassets\.com/),
  d("tidio", "Tidio", "chatt", /code\.tidio\.co/),
  d("crisp", "Crisp", "chatt", /client\.crisp\.chat/),
  d("woocommerce", "WooCommerce", "e-handel", /\/plugins\/woocommerce\/|woocommerce-(?:page|cart)/),
  d("magento", "Magento", "e-handel", /\bMage\.Cookies\b|\/static\/version\d+\/frontend\//),
  d("prestashop", "PrestaShop", "e-handel", /\bprestashop\b/i),
  d("abicart", "Abicart", "e-handel", /abicart\.(?:se|com)|textalk\.se/),
  d("quickbutik", "Quickbutik", "e-handel", /quickbutik\.com/),
  d("starweb", "Starweb", "e-handel", /starweb\.(?:se|net)/),
  d("wikinggruppen", "Wikinggruppen", "e-handel", /wikinggruppen/i),
  d("ecwid", "Ecwid", "e-handel", /app\.ecwid\.com/),
  d("klarna", "Klarna", "betalning", /klarnacdn\.net|klarnaservices\.com/),
  d("stripe", "Stripe", "betalning", /js\.stripe\.com/),
  d("paypal", "PayPal", "betalning", /paypal\.com\/sdk\/js/),
  d("qliro", "Qliro", "betalning", /(?:\/\/|\.)[a-z0-9.-]*qliro\.com/),
  d("trustpilot", "Trustpilot", "omdömen", /widget\.trustpilot\.com/),
  d("reco", "Reco", "omdömen", /(?:\/\/|\.)reco\.se\//),
  d("elfsight", "Elfsight", "widget", /elfsight\.com|elfsightcdn/),
  d("recaptcha", "reCAPTCHA", "formulär", /google\.com\/recaptcha/),
  d("nextjs", "Next.js", "ramverk", /\/_next\/static\/|__NEXT_DATA__/),
  d("nuxt", "Nuxt", "ramverk", /\/_nuxt\/|\b__NUXT__\b/),
  d("gatsby", "Gatsby", "ramverk", /___gatsby\b/),
];

const KNOWN_PLUGINS: Record<string, string> = {
  "wordpress-seo": "Yoast SEO", "seo-by-rank-math": "Rank Math", sitepress: "WPML", "sitepress-multilingual-cms": "WPML",
  gravityforms: "Gravity Forms", "contact-form-7": "Contact Form 7", "wp-rocket": "WP Rocket", elementor: "Elementor",
  "elementor-pro": "Elementor Pro", woocommerce: "WooCommerce", "wpforms-lite": "WPForms", wpforms: "WPForms", polylang: "Polylang",
};

/** Texten runt en träff, för att visa varför detektorn slog till. */
function snippet(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 40);
  return text.slice(from, Math.min(text.length, index + length + 40)).replace(/\s+/g, " ").trim().slice(0, 120);
}

export type Headers = Record<string, string | undefined>;

function detectHeaders(h: Headers): Detection[] {
  const get = (k: string) => h[k.toLowerCase()];
  const out: Detection[] = [];
  const server = get("server") ?? "";
  const powered = get("x-powered-by") ?? "";
  if (/cloudflare/i.test(server) || get("cf-ray")) out.push({ id: "cloudflare", name: "Cloudflare", category: "drift", match: server ? `server: ${server}` : "cf-ray" });
  if (get("x-vercel-id")) out.push({ id: "vercel", name: "Vercel", category: "drift", match: "x-vercel-id" });
  if (get("x-nf-request-id") || /netlify/i.test(server)) out.push({ id: "netlify", name: "Netlify", category: "drift", match: "x-nf-request-id" });
  if (/wp engine/i.test(powered)) out.push({ id: "wpengine", name: "WP Engine", category: "drift", match: `x-powered-by: ${powered}` });
  if (get("x-kinsta-cache")) out.push({ id: "kinsta", name: "Kinsta", category: "drift", match: "x-kinsta-cache" });
  const php = /PHP\/(\d+\.\d+(?:\.\d+)?)/i.exec(powered);
  if (php) out.push({ id: "php", name: "PHP", category: "drift", detail: php[1], match: `x-powered-by: ${powered}` });
  return out;
}

/** Allt som går att läsa ur sidans HTML och, om de finns, svarshuvuden. Varje detektor ger högst en träff. */
export function detectTech(input: { html: string; headers?: Headers }): Detection[] {
  const out: Detection[] = [];
  for (const det of HTML_DETECTORS) {
    const m = det.test.exec(input.html);
    if (m) out.push({ id: det.id, name: det.name, category: det.category, match: snippet(input.html, m.index, m[0].length) });
  }
  const plugins = [...new Set([...input.html.matchAll(/\/wp-content\/plugins\/([a-z0-9][a-z0-9_-]*)\//gi)].map((m) => m[1].toLowerCase()))];
  if (plugins.length > 0) {
    const names = plugins.slice(0, 15).map((p) => KNOWN_PLUGINS[p] ?? p);
    out.push({ id: "wp-plugins", name: "WordPress-tillägg", category: "cms", detail: [...new Set(names)].join(", "), match: `/wp-content/plugins/${plugins[0]}/` });
  }
  if (input.headers) out.push(...detectHeaders(Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v]))));
  return out;
}
