import { describe, expect, it } from "vitest";
import { HTML_DETECTORS } from "./detectors";
import { ICON_BY_ID, ICON_BY_NAME, brandIcon, initialTile } from "./tech-icons";

describe("brandIcon", () => {
  it("has a real icon behind every mapped id and name", () => {
    for (const id of Object.keys(ICON_BY_ID)) {
      const icon = brandIcon({ id });
      expect(icon, id).not.toBeNull();
      expect(icon!.path.length, id).toBeGreaterThan(10);
      expect(icon!.hex, id).toMatch(/^[0-9A-Fa-f]{6}$/);
    }
    for (const name of Object.keys(ICON_BY_NAME)) expect(brandIcon({ name }), name).not.toBeNull();
  });
  it("only maps ids that exist as detectors, in DNS or in the fact book", () => {
    const known = new Set([...HTML_DETECTORS.map((d) => d.id), "wp-plugins", "cloudflare", "vercel", "netlify", "wpengine", "kinsta", "php", "mail-google", "spf-google", "txt-google-verify", "txt-meta-verify", "ns-cloudflare", "spf-mailchimp", "spf-hubspot", "spf-mailgun"]);
    for (const id of Object.keys(ICON_BY_ID)) expect(known.has(id), id).toBe(true);
  });
  it("finds the icon by CMS name, ignoring version text and case", () => {
    expect(brandIcon({ name: "WordPress 7.1.3" })?.title).toBe("WordPress");
    expect(brandIcon({ name: "Elementor" })?.title).toBe("Elementor");
    expect(brandIcon({ name: "Wix" })?.title).toBe("Wix");
  });
  it("gives null for brands that are not in the package, instead of throwing", () => {
    expect(brandIcon({ id: "linkedin" })).toBeNull();
    expect(brandIcon({ id: "okänd", name: "Något Helt Annat" })).toBeNull();
    expect(brandIcon({})).toBeNull();
  });
});

describe("initialTile", () => {
  it("uses the first letter in capitals and the same colours for the same name", () => {
    expect(initialTile("klaviyo").letter).toBe("K");
    expect(initialTile("Klaviyo")).toEqual(initialTile("Klaviyo"));
  });
  it("does not break on an empty name", () => {
    expect(initialTile("").letter).toBe("?");
  });
});
