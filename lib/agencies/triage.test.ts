import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { triageBacklinks, type BacklinkRow } from "./triage";

// Raderna är ett utdrag ur ett riktigt svar från OpenSEO för capace.se (fixtures/openseo-capace.json).
const rows = (JSON.parse(readFileSync(join(__dirname, "fixtures", "openseo-capace.json"), "utf8")) as { backlinks: { rows: BacklinkRow[] } }).backlinks.rows;
const capace = { name: "Capace Media Group", domain: "capace.se" };

describe("triageBacklinks on a real response", () => {
  const { candidates, dropped } = triageBacklinks(rows, capace);
  const kept = candidates.map((c) => c.domain);
  const why = Object.fromEntries(dropped.map((d) => [d.domain, d.reason]));

  it("keeps the customers' footer credits", () => {
    for (const d of ["mifran.se", "soundforrent.se", "dinvinguide.se", "mkjuvel.se", "sko-dej.com", "lackoplatab.se", "re-new.se", "ohedd.se", "kirurgicentrum.se", "jessicafrej.se", "sverigesoffentligakockar.se"]) expect(kept).toContain(d);
  });
  it("drops redirects, listings, directories and the agency's own subdomains, with the reason", () => {
    expect(why).toMatchObject({
      "sponsorhjalpen.se": "redirect", "smartoptimering.se": "redirect",
      "europes.run": "listing", "webbyratoppen.se": "listing", "localist.konigle.com": "listing",
      "leadster.ai": "directory", "revenuebase.ai": "directory", "cl0q.com": "directory", "five.co.in": "directory", "robuta.com": "directory",
      "blogg.capace.se": "own-domain",
    });
  });
  it("sorts clear credits first, bare names next, weak links last, and partner pages at the very end", () => {
    const strengths = candidates.map((c) => c.strength);
    expect(strengths.indexOf("credit")).toBeLessThan(strengths.indexOf("name"));
    const last = candidates.slice(-3).map((c) => c.domain);
    expect(last).toEqual(expect.arrayContaining(["handbollslandslaget.se"]));
    expect(candidates.find((c) => c.domain === "handbollslandslaget.se")).toMatchObject({ partner: true, strength: "weak" });
    expect(candidates.find((c) => c.domain === "autogruppen.eu")?.partner).toBe(true);
  });
  it("marks the strength by what the link text says", () => {
    const by = Object.fromEntries(candidates.map((c) => [c.domain, c.strength]));
    expect(by["sko-dej.com"]).toBe("credit");
    expect(by["mifran.se"]).toBe("credit");
    expect(by["dinvinguide.se"]).toBe("name");
    expect(by["jamjo-flak.se"]).toBe("name");
  });
  it("lets verification judge partner and sponsor pages instead of dropping them", () => {
    expect(kept).toContain("hkmalmo.se");
  });
  it("keeps one row per domain, the strongest", () => {
    const two = triageBacklinks([{ ...rows[0], domainFrom: "kund.se", anchor: "Läs mer" }, { ...rows[0], domainFrom: "www.kund.se", anchor: "Byggd med ♥ av Capace Media" }], capace);
    expect(two.candidates).toHaveLength(1);
    expect(two.candidates[0]).toMatchObject({ domain: "kund.se", strength: "credit" });
  });
  it("drops high spam scores but not middling ones", () => {
    const spam = triageBacklinks([{ ...rows[0], domainFrom: "skrap.se", spamScore: 60 }, { ...rows[0], domainFrom: "okej.se", spamScore: 35 }], capace);
    expect(spam.dropped).toEqual([{ domain: "skrap.se", reason: "spam" }]);
    expect(spam.candidates.map((c) => c.domain)).toEqual(["okej.se"]);
  });
});
