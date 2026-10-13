import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "./db";
import { countCompanies, getLists, getSource, getSources, getSuppliers, searchCompanies } from "./queries";
import { getQueueIds } from "./dialer/queue";

const ORG = "cccccccc-0000-0000-0000-000000000003";
const U = "dddddddd-0000-0000-0000-000000000021";

beforeAll(async () => {
  await pool.query(`delete from organizations where id = $1`, [ORG]);
  await pool.query(`delete from auth.users where id = $1`, [U]);
  await pool.query(`insert into organizations (id, name, slug) values ($1, 'IT Lists', 'it-lists')`, [ORG]);
  await pool.query(`insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated','lists@example.invalid',now(),now())`, [U]);
  // En egen opublicerad källa med ett företag, så att testet inte hänger på vad som är publicerat i den levande katalogen.
  await cleanFixture();
  await pool.query(`insert into suppliers (id, slug, name, kind, published) values (gen_random_uuid(), $1, 'Opublicerad testkälla', 'supplier', false)`, [UNPUB]);
  const co = (await pool.query(`insert into companies (dedupe_key, domain, name) values ('zz-unpub-itest.se', 'zz-unpub-itest.se', 'Opublicerat AB') returning id`)).rows[0].id;
  await pool.query(`insert into company_signals (company_id, supplier_id) values ($1, (select id from suppliers where slug = $2))`, [co, UNPUB]);
});
const UNPUB = "zz-unpub-itest";
async function cleanFixture() {
  await pool.query(`delete from suppliers where slug = $1`, [UNPUB]);
  await pool.query(`delete from companies where dedupe_key = 'zz-unpub-itest.se'`);
}
afterAll(async () => {
  await cleanFixture();
  await pool.query(`delete from organizations where id = $1`, [ORG]);
  await pool.query(`delete from auth.users where id = $1`, [U]);
  await pool.end();
});

describe("leverantörer och listor", () => {
  it("getSuppliers returns only published real suppliers", async () => {
    const s = await getSuppliers();
    const slugs = s.map((x) => x.slug);
    expect(slugs).not.toContain("redovisningsbyraer");
    expect(slugs).not.toContain("wix");
    expect(slugs).not.toContain("exempel");
    expect(slugs).not.toContain(UNPUB);
    expect(slugs).toContain("bokadirekt");
    expect(slugs).toContain("cms");
  });

  it("getLists groups the lists by category", async () => {
    const cats = await getLists();
    const by = Object.fromEntries(cats.map((c) => [c.slug, c.lists.map((l) => l.slug).sort()]));
    expect(by.bransch).toEqual(["redovisningsbyraer"]);
    expect(by.plattform).toEqual(["godaddy", "wix", "wordpress-divi"]);
    expect(cats.find((c) => c.slug === "plattform")?.names_brand).toBe(true);
    expect(cats.find((c) => c.slug === "bransch")?.names_brand).toBe(false);
  });

  it("keeps the company counts from the import", async () => {
    const cats = await getLists();
    const n = (slug: string) => cats.flatMap((c) => c.lists).find((l) => l.slug === slug)?.n;
    expect(n("redovisningsbyraer")).toBe(1191);
    expect(n("wix")).toBe(9035);
  });

  it("getSource knows the kind, and hides unpublished sources", async () => {
    expect((await getSource("redovisningsbyraer"))?.kind).toBe("list");
    expect((await getSource("redovisningsbyraer"))?.category?.name).toBe("Bransch");
    expect((await getSource("roi"))?.kind).toBe("supplier");
    expect(await getSource(UNPUB)).toBeNull();
    expect(await getSource("exempel")).toBeNull();
  });

  it("getSources lists suppliers first, then lists per category", async () => {
    const s = await getSources();
    const firstList = s.findIndex((x) => x.kind === "list");
    expect(s.slice(0, firstList).every((x) => x.kind === "supplier")).toBe(true);
    expect(s.slice(firstList).every((x) => x.kind === "list")).toBe(true);
    expect(s.map((x) => x.slug)).not.toContain(UNPUB);
  });

  it("a list works as a filter and as a ring queue", async () => {
    expect(await countCompanies({ supplier: "redovisningsbyraer", orgId: ORG })).toBe(1191);
    const rows = await searchCompanies({ supplier: "redovisningsbyraer", orgId: ORG }, 5);
    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.supplier === "Redovisningsbyråer")).toBe(true);
    const ids = await getQueueIds(ORG, U, { sources: ["redovisningsbyraer"], mode: "new" }, "namn", 20);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("companies only in an unpublished source are not in anyone's queue", async () => {
    const ids = await getQueueIds(ORG, U, { sources: [UNPUB], mode: "new" }, "namn", 20);
    expect(ids).toEqual([]);
  });

  it("the category check rejects a supplier with a category", async () => {
    await expect(pool.query(`update suppliers set category_id = (select id from list_categories limit 1) where slug = 'roi'`)).rejects.toThrow(/suppliers_category_only_for_lists/);
  });
});
