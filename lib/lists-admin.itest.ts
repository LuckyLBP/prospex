import { readCollection } from "./sources/collection";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "./db";
import { createCategory, createList, deleteCategory, ListError, listCategories, listSources, updateCategory, updateSource } from "./lists-admin";
import { getLists, getSource } from "./queries";

const CAT = "Testkategori Itest";
const LIST = "Testlista Itest";

afterAll(async () => {
  await pool.query(`delete from suppliers where slug = 'testlista-itest'`);
  await pool.query(`delete from list_categories where slug = 'testkategori-itest'`);
  await pool.end();
});

describe("admin för listor", () => {
  it("creates a category and rejects a duplicate name", async () => {
    await createCategory({ name: CAT, description: "x", icon: "Layers", namesBrand: false, sort: 99 });
    await expect(createCategory({ name: CAT, description: "", icon: "Layers", namesBrand: false, sort: 1 })).rejects.toThrow(/finns redan/);
  });

  it("creates a list in the category with a Google Places config, unpublished by default behaviour of the flag", async () => {
    const cat = (await listCategories()).find((c) => c.name === CAT)!;
    const slug = await createList({ name: LIST, description: "", kind: "list", categoryId: cat.id, published: false, sort: 5, collection: { method: "googleplaces", config: { queries: "frisör\nfrisörsalong", locations: "Stockholm\nMalmö", maxPages: 2 }, enrichSites: true } });
    expect(slug).toBe("testlista-itest");
    const s = (await listSources()).find((x) => x.slug === slug)!;
    expect(s.kind).toBe("list");
    expect(s.method).toBe("googleplaces");
    expect(s.config).toEqual({ queries: "frisör\nfrisörsalong", locations: "Stockholm\nMalmö", maxPages: 2 });
  });

  it("refuses a list without a category and a bad search config", async () => {
    await expect(createList({ name: "Utan kategori", description: "", kind: "list", categoryId: null, published: true, sort: 0 })).rejects.toBeInstanceOf(ListError);
    const bad = readCollection((k) => ({ method: "googleplaces", gp_queries: "a", gp_locations: "x", gp_pages: "9" } as Record<string, string>)[k] ?? "");
    expect(bad).toMatchObject({ ok: false, error: expect.stringMatching(/Antal sidor/) });
  });

  it("an empty or unpublished list is invisible to customers", async () => {
    expect(await getSource("testlista-itest")).toBeNull(); // opublicerad
    const cat = (await listCategories()).find((c) => c.name === CAT)!;
    const id = (await listSources()).find((x) => x.slug === "testlista-itest")!.id;
    await updateSource(id, { name: LIST, description: "", kind: "list", categoryId: cat.id, published: true, sort: 5 });
    expect((await getSource("testlista-itest"))?.name).toBe(LIST); // publicerad nu
    const shown = (await getLists()).flatMap((c) => c.lists.map((l) => l.slug));
    expect(shown).not.toContain("testlista-itest"); // men tom, så den visas inte i Listor
  });

  it("the slug never changes when the name does", async () => {
    const id = (await listSources()).find((x) => x.slug === "testlista-itest")!.id;
    const cat = (await listCategories()).find((c) => c.name === CAT)!;
    await updateSource(id, { name: "Helt nytt namn", description: "", kind: "list", categoryId: cat.id, published: true, sort: 5 });
    expect((await getSource("testlista-itest"))?.name).toBe("Helt nytt namn");
  });

  it("switching a list to a supplier clears its category, and a category with lists cannot be deleted", async () => {
    const cat = (await listCategories()).find((c) => c.name === CAT)!;
    await expect(deleteCategory(cat.id)).rejects.toThrow(/har listor/);
    const id = (await listSources()).find((x) => x.slug === "testlista-itest")!.id;
    await updateSource(id, { name: LIST, description: "", kind: "supplier", categoryId: cat.id, published: false, sort: 5 });
    const s = (await listSources()).find((x) => x.slug === "testlista-itest")!;
    expect(s.kind).toBe("supplier");
    expect(s.category_id).toBeNull();
    await updateCategory(cat.id, { name: CAT, description: "ändrad", icon: "Briefcase", namesBrand: true, sort: 98 });
    await deleteCategory(cat.id); // nu tom
    expect((await listCategories()).find((c) => c.name === CAT)).toBeUndefined();
  });
});
