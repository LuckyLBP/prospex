import { describe, expect, it } from "vitest";
import { HTML_DETECTORS, detectTech } from "./detectors";

// Ett utdrag per detektor, som det ser ut i verklig HTML.
const POSITIVE: Record<string, string> = {
  ga4: `<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4"></script>`,
  ua: `<script>ga('create', 'UA-12345678-1', 'auto');</script>`,
  gtm: `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCD12"></script>`,
  gads: `<script async src="https://www.googletagmanager.com/gtag/js?id=AW-123456789"></script>`,
  meta: `<script>fbq('init', '123456789');</script>`,
  linkedin: `<script>_linkedin_partner_id = "1234567";</script>`,
  tiktok: `<script>ttq.load('C1234567');</script>`,
  snap: `<script src="https://sc-static.net/scevent.min.js"></script>`,
  pinterest: `<script>pintrk('load', '2612345678');</script>`,
  bing: `<script src="//bat.bing.com/bat.js"></script>`,
  clarity: `<script>(function(c,l,a,r,i,t,y){t.src="https://www.clarity.ms/tag/"+i;})</script>`,
  hotjar: `<script src="https://static.hotjar.com/c/hotjar-123.js?sv=6"></script>`,
  matomo: `<script>var _paq = window._paq = window._paq || []; _paq.push(['trackPageView']);</script>`,
  plausible: `<script defer data-domain="x.se" src="https://plausible.io/js/script.js"></script>`,
  leadinfo: `<script src="https://cdn.leadinfo.net/ping.js"></script>`,
  leadfeeder: `<script src="https://sc.lfeeder.com/lftracker_v1_abc.js"></script>`,
  cookiebot: `<script src="https://consent.cookiebot.com/uc.js" data-cbid="x"></script>`,
  cookieyes: `<script src="https://cdn-cookieyes.com/client_data/abc/script.js"></script>`,
  onetrust: `<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>`,
  complianz: `<link href="/wp-content/plugins/complianz-gdpr/assets/css/cookieblocker.min.css">`,
  cookieinfo: `<script src="https://policy.app.cookieinformation.com/uc.js"></script>`,
  usercentrics: `<script src="https://app.usercentrics.eu/browser-ui/latest/loader.js"></script>`,
  hubspot: `<script src="//js.hs-scripts.com/1234567.js"></script>`,
  mailchimp: `<script src="https://chimpstatic.com/mcjs-connected/js/users/abc.js"></script>`,
  activecampaign: `<script src="https://trackcmp.net/visit?actid=1"></script>`,
  klaviyo: `<script src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=ABC123"></script>`,
  rule: `<script src="https://app.rule.io/subscriber-forms/x.js"></script>`,
  getanewsletter: `<form action="https://app.getanewsletter.com/form/x"></form>`,
  intercom: `<script>window.intercomSettings = {app_id: "abc"};</script>`,
  tawk: `<script src="https://embed.tawk.to/abc/default"></script>`,
  zendesk: `<script src="https://static.zdassets.com/ekr/snippet.js?key=x"></script>`,
  tidio: `<script src="//code.tidio.co/abc.js"></script>`,
  crisp: `<script src="https://client.crisp.chat/l.js"></script>`,
  woocommerce: `<body class="woocommerce-page woocommerce-cart">`,
  magento: `<script>require(['Magento_Ui']); Mage.Cookies.path = '/';</script>`,
  prestashop: `<script>var prestashop = {"cart":{}};</script>`,
  abicart: `<script src="https://cdn.abicart.se/x.js"></script>`,
  quickbutik: `<script src="https://cdn.quickbutik.com/x.js"></script>`,
  starweb: `<script src="https://cdn.starweb.se/x.js"></script>`,
  wikinggruppen: `<meta name="generator" content="Wikinggruppen">`,
  ecwid: `<script src="https://app.ecwid.com/script.js?123"></script>`,
  klarna: `<script src="https://x.klarnacdn.net/kp/lib/v1/api.js"></script>`,
  stripe: `<script src="https://js.stripe.com/v3/"></script>`,
  paypal: `<script src="https://www.paypal.com/sdk/js?client-id=x"></script>`,
  qliro: `<script src="https://checkout.qliro.com/x.js"></script>`,
  trustpilot: `<script src="https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"></script>`,
  reco: `<script src="https://widget.reco.se/v2/widget.js"></script>`,
  elfsight: `<script src="https://static.elfsight.com/platform/platform.js"></script>`,
  recaptcha: `<script src="https://www.google.com/recaptcha/api.js"></script>`,
  nextjs: `<script src="/_next/static/chunks/main-abc.js"></script>`,
  nuxt: `<script src="/_nuxt/entry.abc.js"></script>`,
  gatsby: `<div id="___gatsby"></div>`,
};

const NEUTRAL = `<html><head><title>Hej</title></head><body><h1>Välkommen</h1><p>Vi är ett företag. Kontakta oss på telefon.</p><a href="/om-oss">Om oss</a></body></html>`;

describe("HTML detectors", () => {
  it("has a positive sample for every detector, and no sample without a detector", () => {
    expect(Object.keys(POSITIVE).sort()).toEqual(HTML_DETECTORS.map((x) => x.id).sort());
  });
  for (const det of HTML_DETECTORS) {
    it(`${det.name}: finds it in a real-looking snippet, and not on a plain page`, () => {
      const hit = detectTech({ html: POSITIVE[det.id] }).find((x) => x.id === det.id);
      expect(hit, det.id).toBeDefined();
      expect(hit!.name).toBe(det.name);
      expect(hit!.match!.length).toBeLessThanOrEqual(120);
      expect(detectTech({ html: NEUTRAL }).find((x) => x.id === det.id)).toBeUndefined();
    });
  }
  it("finds nothing at all on a plain page", () => {
    expect(detectTech({ html: NEUTRAL })).toEqual([]);
  });
});

describe("detectors that must not over-match", () => {
  it("does not take ordinary words or other schedules for Rule or Qliro", () => {
    expect(detectTech({ html: `<p>Följ vårt schedule.io-flöde, se http://scrule.io</p>` }).find((x) => x.id === "rule")).toBeUndefined();
    expect(detectTech({ html: `<p>Vi gillar inte qliroz</p>` }).find((x) => x.id === "qliro")).toBeUndefined();
  });
  it("does not take a GA4 id in running text without the tag for a pixel or Ads", () => {
    const ids = detectTech({ html: `<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4"></script>` }).map((x) => x.id);
    expect(ids).toContain("ga4");
    expect(ids).not.toContain("gads");
  });
  it("tells Google Ads (AW-) from Analytics (G-)", () => {
    const ids = detectTech({ html: `<script src="https://www.googletagmanager.com/gtag/js?id=AW-123456789"></script>` }).map((x) => x.id);
    expect(ids).toContain("gads");
    expect(ids).not.toContain("ga4");
  });
  it("does not call a page that merely mentions Facebook a Meta pixel", () => {
    expect(detectTech({ html: `<a href="https://www.facebook.com/foretaget">Följ oss</a>` }).find((x) => x.id === "meta")).toBeUndefined();
  });
});

describe("WordPress plugins", () => {
  it("lists plugins once each, naming the well known ones", () => {
    const html = `<link href="/wp-content/plugins/wordpress-seo/a.css"><script src="/wp-content/plugins/wordpress-seo/b.js"></script><script src="/wp-content/plugins/my-odd-plugin/x.js"></script><script src="/wp-content/plugins/sitepress-multilingual-cms/y.js"></script>`;
    const hit = detectTech({ html }).find((x) => x.id === "wp-plugins")!;
    expect(hit.detail).toBe("Yoast SEO, my-odd-plugin, WPML");
  });
  it("caps the list at fifteen", () => {
    const html = Array.from({ length: 30 }, (_, i) => `<link href="/wp-content/plugins/p${i}/x.css">`).join("");
    expect(detectTech({ html }).find((x) => x.id === "wp-plugins")!.detail!.split(", ")).toHaveLength(15);
  });
});

describe("response headers", () => {
  it("detects hosting from headers regardless of header name case", () => {
    const ids = (h: Record<string, string>) => detectTech({ html: NEUTRAL, headers: h }).map((x) => x.id);
    expect(ids({ Server: "cloudflare", "CF-Ray": "abc" })).toEqual(["cloudflare"]);
    expect(ids({ "x-vercel-id": "arn1::abc" })).toEqual(["vercel"]);
    expect(ids({ "X-NF-Request-Id": "abc" })).toEqual(["netlify"]);
    expect(ids({ "x-powered-by": "WP Engine" })).toEqual(["wpengine"]);
    expect(ids({ "x-kinsta-cache": "HIT" })).toEqual(["kinsta"]);
  });
  it("reads the PHP version", () => {
    expect(detectTech({ html: NEUTRAL, headers: { "x-powered-by": "PHP/8.1.27" } })).toEqual([{ id: "php", name: "PHP", category: "drift", detail: "8.1.27", match: "x-powered-by: PHP/8.1.27" }]);
  });
  it("says nothing when the headers say nothing", () => {
    expect(detectTech({ html: NEUTRAL, headers: { server: "nginx", "content-type": "text/html" } })).toEqual([]);
  });
});
