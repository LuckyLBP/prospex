import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findFooterCredits } from "./creator";
import { isWebPlatformDomain } from "./platforms";

// Riktiga sidfötter och vad som ska komma ut ur dem. Hittar du en sajt där byrån blir fel: lägg en HTML-fil och en
// JSON-fil med samma namn i fixtures/footers/, så är det rättat för gott.

const DIR = join(__dirname, "fixtures", "footers");
const cases = readdirSync(DIR).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, ""));

interface Expected {
  site: string;
  agency: { name: string; domain: string; phrase: string } | null;
  platforms: { name: string; domain: string }[];
}

describe("footer fixtures", () => {
  it("has at least the Karaten case", () => expect(cases).toContain("karaten"));
  for (const name of cases) {
    it(name, () => {
      const html = readFileSync(join(DIR, `${name}.html`), "utf8");
      const want = JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as Expected;
      const got = findFooterCredits(html, want.site, null, (d) => isWebPlatformDomain(d));
      expect(got.agency ? { name: got.agency.name, domain: got.agency.domain, phrase: got.agency.phrase } : null).toEqual(want.agency);
      expect(got.platforms.map((p) => ({ name: p.name, domain: p.domain }))).toEqual(want.platforms);
    });
  }
});
