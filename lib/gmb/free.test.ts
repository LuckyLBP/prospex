import { describe, expect, it, vi } from "vitest";
import { checkCompanyFree, defaultFreeDeps, type FreeDeps } from "./free";
import type { RawPlace } from "./check";

const pred = (name: string, address = "Storgatan 1, Göteborg", id = `id-${name}`): RawPlace => ({ id, displayName: { text: name }, formattedAddress: `${name}, ${address}` });

function deps(over: Partial<FreeDeps> = {}): FreeDeps & { closeSession: ReturnType<typeof vi.fn> } {
  return { autocomplete: async () => [], closeSession: vi.fn(async () => {}), ids: async () => [], homepage: async () => null, ...over } as never;
}

describe("checkCompanyFree", () => {
  it("has a profile when autocomplete returns the company, and closes the session with the free lookup", async () => {
    const d = deps({ autocomplete: async () => [pred("Täby Bygg & Måleri AB")] });
    const r = await checkCompanyFree({ name: "Täby Bygg & Måleri AB", domain: "tabybygg.se" }, d);
    expect(r).toMatchObject({ state: "has", via: "autocomplete", placeName: "Täby Bygg & Måleri AB" });
    expect(d.closeSession).toHaveBeenCalledTimes(1);
  });
  it("does not open a billable session it cannot close: nothing to close when there are no suggestions", async () => {
    const d = deps({ autocomplete: async () => [] });
    await checkCompanyFree({ name: "Rörmokaren Kjell AB", domain: "kjell.se" }, d);
    expect(d.closeSession).not.toHaveBeenCalled();
  });
  it("falls back to the company's own link to its profile", async () => {
    const d = deps({ homepage: async () => '<a href="https://g.page/r/abc/review">Betygsätt</a>' });
    expect(await checkCompanyFree({ name: "Rörmokaren Kjell AB", domain: "kjell.se" }, d)).toMatchObject({ state: "has", via: "site-link" });
  });
  it("counts a phone number found on a profile as having one, but ignores an example number", async () => {
    const ids = vi.fn(async (q: string) => (q === "0701234568" ? ["ChIJabc"] : []));
    expect(await checkCompanyFree({ name: "Rörmokaren Kjell AB", domain: "kjell.se", phone: "+46701234568" }, deps({ ids }))).toMatchObject({ state: "has", via: "phone", placeId: "ChIJabc" });
    const ids2 = vi.fn(async () => ["x"]);
    await checkCompanyFree({ name: "Rörmokaren Kjell AB", phone: "070-123 45 67" }, deps({ ids: ids2 }));
    expect(ids2).not.toHaveBeenCalled();
  });
  it("is unsure, never none, when the website query returns a few results (they are often just similar words)", async () => {
    const ids = vi.fn(async (q: string) => (q === "kjell.se" ? ["ChIJone"] : []));
    expect(await checkCompanyFree({ name: "Rörmokaren Kjell AB", domain: "kjell.se" }, deps({ ids }))).toMatchObject({ state: "unsure", via: "website-id" });
  });
  it("says none only when nothing at all points at a listing", async () => {
    expect(await checkCompanyFree({ name: "Rörmokaren Kjell AB", domain: "kjell.se", phone: "+46701234568" }, deps())).toMatchObject({ state: "none" });
  });
  it("is unsure when an id search fails, and null when autocomplete itself fails", async () => {
    expect(await checkCompanyFree({ name: "Rörmokaren Kjell AB", domain: "kjell.se" }, deps({ ids: async () => null }))).toMatchObject({ state: "unsure" });
    expect(await checkCompanyFree({ name: "Rörmokaren Kjell AB" }, deps({ autocomplete: async () => null }))).toBeNull();
  });
  it("is unsure and not none for a name that is only a page title", async () => {
    expect(await checkCompanyFree({ name: "Din charterflygplats från Norrköping", domain: "x.se" }, deps())).toMatchObject({ state: "unsure" });
  });
});

describe("defaultFreeDeps asks only for the free fields", () => {
  it("sends the id-only field mask to both free searches", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ places: [{ id: "a" }] }), { status: 200 })) as unknown as typeof fetch;
    const d = defaultFreeDeps("key", f);
    await d.ids("kjell.se");
    await d.closeSession("ChIJabc", "session-1");
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    expect((calls[0][1].headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("places.id");
    expect((calls[1][1].headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("id");
    expect(calls[1][0]).toContain("sessionToken=session-1");
  });
});
