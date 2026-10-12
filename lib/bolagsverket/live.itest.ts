import { describe, expect, it } from "vitest";
import { getAnnualFigures, getOrganisation, isBolagsverketConfigured, isBolagsverketTest } from "./client";

// Riktiga anrop mot Bolagsverkets API. Kör bara med nycklar i miljön:
//   set -a; . ./.env.local; set +a; npx vitest run --config vitest.integration.config.mts lib/bolagsverket
describe.skipIf(!isBolagsverketConfigured())("Bolagsverkets API", () => {
  it("answers with company data for a real organisation number", async () => {
    const org = await getOrganisation("5594497611"); // Adis Bygg AB
    if (isBolagsverketTest()) return expect(org).toBeNull(); // acceptansmiljön känner bara testnummer
    expect(org).not.toBeNull();
    expect(org!.name?.toLowerCase()).toContain("adis");
    expect(org!.legalForm?.label).toBeTruthy();
    expect(org!.sni.length).toBeGreaterThan(0);
  });

  it("says null (not an error) for a number that does not exist", async () => {
    expect(await getOrganisation("1111111111")).toBeNull();
  });

  it("returns annual figures or null, never throws, for a small company", async () => {
    const figures = await getAnnualFigures("5594497611");
    if (figures) expect(figures.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
