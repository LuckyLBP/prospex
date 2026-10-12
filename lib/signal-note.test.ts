import { describe, expect, it } from "vitest";
import { signalNote } from "./signal-note";

const sup = (supplier: string) => ({ supplier, kind: "supplier" as const, names_brand: true });
const list = (supplier: string, names_brand: boolean) => ({ supplier, kind: "list" as const, names_brand });

describe("signalNote", () => {
  it("says supplier and no connection for a supplier", () => {
    expect(signalNote([sup("ROI")])).toBe("Signal: företag med ROI som leverantör. Vi har ingen koppling till ROI.");
  });
  it("names several suppliers in Swedish", () => {
    expect(signalNote([sup("A"), sup("B"), sup("C")])).toContain("med A, B och C som leverantör");
    expect(signalNote([sup("A"), sup("B")])).toContain("Vi har ingen koppling till A eller B.");
  });
  it("only says it is in the list for an industry list, with no disclaimer", () => {
    expect(signalNote([list("Redovisningsbyråer", false)])).toBe("Finns i listan Redovisningsbyråer.");
  });
  it("adds the disclaimer for a platform list, because it names a brand", () => {
    expect(signalNote([list("Egen sida i Wix", true)])).toBe("Finns i listan Egen sida i Wix. Vi har ingen koppling till Egen sida i Wix.");
  });
  it("combines a supplier with lists, and only disclaims the named ones", () => {
    const t = signalNote([sup("Bokadirekt"), list("Redovisningsbyråer", false), list("Egen sida i Wix", true)]);
    expect(t).toBe("Signal: företag med Bokadirekt som leverantör. Finns i listorna Redovisningsbyråer och Egen sida i Wix. Vi har ingen koppling till Bokadirekt eller Egen sida i Wix.");
  });
  it("does not repeat a name and never uses a dash", () => {
    const t = signalNote([sup("X"), sup("X"), list("Y", true)]);
    expect(t.match(/X/g)?.length).toBe(2);
    expect(t).not.toMatch(/[–—]/);
  });
  it("is empty for a company with no signals", () => {
    expect(signalNote([])).toBe("");
  });
});
