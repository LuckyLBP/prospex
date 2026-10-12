import { describe, expect, it } from "vitest";
import aktiebolag from "./fixtures/organisationer-aktiebolag.json";
import felsvar from "./fixtures/organisationer-fel.json";
import { latestDocument, mapOrganisation, parseAnnualFigures, parseIxNumber } from "./map";
import { companyStatus } from "./types";

// Fixturerna är exempelsvaren ur Bolagsverkets egen OpenAPI-specifikation
// (VärdefullaDatamängder v1), hämtade 2026-09-16.

describe("mapOrganisation", () => {
  it("reads Bolagsverket's example limited company", () => {
    const company = mapOrganisation(aktiebolag, "5299999994");
    expect(company).toMatchObject({
      orgnr: "5299999994",
      name: "Cykelbolaget AB",
      otherNames: ["Mopedbolaget AB", "Bicycle expert"],
      legalForm: { code: "AB", label: "Aktiebolag" },
      registeredAt: "2000-01-23",
      active: false,
      deregisteredAt: "2023-05-05",
      deregistrationReason: "Likvidation",
      description: "Bedriva handel med cyklar och tillbehör till cyklar",
      advertisingBlocked: true,
      unavailable: [],
    });
    expect(company?.sni).toEqual([
      { code: "47642", label: "Specialiserad butikshandel med cyklar" },
      { code: "45400", label: "EU-mopeder, reservdelar och tillbehör, handel med" },
    ]);
    expect(company?.address).toEqual({ street: "Jobbstigen 2", postalCode: "12345", city: "Grönköping", co: "C/o Annat företag" });
    // The example spells the key "pagande…", the schema "pagaende…"; both are read.
    expect(company?.proceedings).toEqual([
      { label: "Konkurs", from: "2024-01-26" },
      { label: "Likvidation", from: "2024-05-26" },
    ]);
  });

  it("puts deregistration ahead of everything else in the status", () => {
    const company = mapOrganisation(aktiebolag, "5299999994")!;
    expect(companyStatus(company)).toEqual({ kind: "deregistered", date: "2023-05-05", reason: "Likvidation" });
    expect(companyStatus({ ...company, deregisteredAt: null })).toEqual({ kind: "proceeding", label: "Konkurs", from: "2024-01-26" });
    expect(companyStatus({ ...company, deregisteredAt: null, proceedings: [], active: true })).toEqual({ kind: "active" });
  });

  it("lists what a failing source could not deliver instead of failing the whole answer", () => {
    const company = mapOrganisation(felsvar, "5560021361");
    expect(company?.name).toBeNull();
    expect(company?.unavailable).toContain("bolagsform");
    expect(company?.unavailable).toContain("adress");
  });

  it("returns null for an empty answer", () => {
    expect(mapOrganisation({ organisationer: [] }, "5560021361")).toBeNull();
  });
});

describe("latestDocument", () => {
  it("picks the newest fiscal year", () => {
    expect(
      latestDocument({
        dokument: [
          { dokumentId: "a", filformat: "application/zip", rapporteringsperiodTom: "2022-12-31", registreringstidpunkt: "2023-06-27" },
          { dokumentId: "b", filformat: "application/zip", rapporteringsperiodTom: "2023-12-31", registreringstidpunkt: "2024-05-02" },
        ],
      }),
    ).toEqual({ id: "b", periodEnd: "2023-12-31", registeredAt: "2024-05-02" });
    expect(latestDocument({ dokument: [] })).toBeNull();
  });
});

describe("parseIxNumber", () => {
  it("reads Swedish and English number formats", () => {
    expect(parseIxNumber("1 234 567", "ixt:numspacecomma")).toBe(1234567);
    expect(parseIxNumber("1.234,5", "ixt:numdotcomma")).toBe(1234.5);
    expect(parseIxNumber("1,234.5", "ixt:numcommadot")).toBe(1234.5);
    expect(parseIxNumber("45,3", "ixt4:num-comma-decimal")).toBe(45.3);
    expect(parseIxNumber("-", "ixt:fixed-zero")).toBe(0);
    expect(parseIxNumber("<span>12</span>", null)).toBe(12);
  });
});

// A trimmed K2 report in the shape Bolagsverket's taxonomy produces: this year
// and last year side by side, one value in thousands, one negative, and a
// dimensional context that must be ignored.
const REPORT = `
<html><body>
<xbrli:context id="period0"><xbrli:entity/><xbrli:period><xbrli:startDate>2023-01-01</xbrli:startDate><xbrli:endDate>2023-12-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="period1"><xbrli:entity/><xbrli:period><xbrli:startDate>2022-01-01</xbrli:startDate><xbrli:endDate>2022-12-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="balans0"><xbrli:entity/><xbrli:period><xbrli:instant>2023-12-31</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="balans0_aktie"><xbrli:entity><xbrli:segment><xbrldi:explicitMember>x</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2023-12-31</xbrli:instant></xbrli:period></xbrli:context>
<td><ix:nonFraction name="se-gen-base:Nettoomsattning" contextRef="period1" unitRef="SEK" format="ixt:numspacecomma" decimals="INF" scale="0">900 000</ix:nonFraction></td>
<td><ix:nonFraction name="se-gen-base:Nettoomsattning" contextRef="period0" unitRef="SEK" format="ixt:numspacecomma" decimals="-3" scale="3">1 250</ix:nonFraction></td>
<td><ix:nonFraction name="se-gen-base:AretsResultat" contextRef="period0" unitRef="SEK" format="ixt:numspacecomma" sign="-" scale="0">42 000</ix:nonFraction></td>
<td><ix:nonFraction name="se-gen-base:MedelantaletAnstallda" contextRef="period0" unitRef="antal-anstallda" format="ixt:numspacecomma" scale="0">4</ix:nonFraction></td>
<td><ix:nonFraction name="se-gen-base:EgetKapital" contextRef="balans0_aktie" unitRef="SEK" scale="0">1</ix:nonFraction></td>
<td><ix:nonFraction name="se-gen-base:EgetKapital" contextRef="balans0" unitRef="SEK" format="ixt:numspacecomma" scale="0">310 500</ix:nonFraction></td>
<td><ix:nonFraction name="se-gen-base:Rorelseresultat" contextRef="period0" unitRef="SEK" format="ixt:numspacecomma" sign="-" scale="0">30 000</ix:nonFraction></td>
<td><ix:nonFraction name="se-gen-base:Soliditet" contextRef="balans0" unitRef="procent" format="ixt:numcomma" scale="-2">45,3</ix:nonFraction></td>
</body></html>`;

describe("parseAnnualFigures", () => {
  it("takes this year's figures, scaled and signed, and skips dimensional contexts", () => {
    expect(parseAnnualFigures(REPORT, "2023-12-31", "2024-05-02")).toEqual({
      periodEnd: "2023-12-31",
      registeredAt: "2024-05-02",
      revenue: 1_250_000,
      profit: -42_000,
      employees: 4,
      equity: 310_500,
      totalAssets: null,
      solidity: 45.3,
      operatingProfit: -30_000,
      previous: { periodEnd: "2022-12-31", revenue: 900_000, profit: null, employees: null, equity: null },
    });
  });

  it("has no previous year when the file holds only one", () => {
    const single = REPORT.replace(/<xbrli:context id="period1">.*<\/xbrli:context>\n/, "").replace(/<td><ix:nonFraction name="se-gen-base:Nettoomsattning" contextRef="period1".*<\/td>\n/, "");
    expect(parseAnnualFigures(single, "2023-12-31")?.previous).toBeNull();
  });

  it("falls back to the latest period in the file", () => {
    expect(parseAnnualFigures(REPORT, null)?.periodEnd).toBe("2023-12-31");
  });

  it("returns null for a file without figures", () => {
    expect(parseAnnualFigures("<html></html>", "2023-12-31")).toBeNull();
  });
});
