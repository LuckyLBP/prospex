import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { adoptSupplierLogo } from "./store";

const DOMAIN = "zz-logo-adopt.se";
const SLUG = "zz-logo-adopt";

async function clean() {
  await pool.query(`delete from suppliers where slug = $1`, [SLUG]);
}
beforeAll(async () => {
  await clean();
  await pool.query(`insert into suppliers (id, slug, name, kind, published, domain) values (gen_random_uuid(), $1, 'Logo Adopt', 'supplier', false, $2)`, [SLUG, DOMAIN]);
});
afterAll(async () => {
  await clean();
  await pool.end();
});

const logo = async () => (await pool.query(`select logo_path from suppliers where slug = $1`, [SLUG])).rows[0].logo_path as string | null;

describe("adoptSupplierLogo", () => {
  it("gives a source without a logo the profile's logo, and never replaces one that is set", async () => {
    expect(await logo()).toBeNull();
    expect(await adoptSupplierLogo(DOMAIN, "web-zz-logo-adopt.se-1.png")).toBe(true);
    expect(await logo()).toBe("web-zz-logo-adopt.se-1.png");
    expect(await adoptSupplierLogo(`www.${DOMAIN}`, "web-annan.png")).toBe(false);
    expect(await logo()).toBe("web-zz-logo-adopt.se-1.png");
  });
  it("does nothing without a domain, a logo or a matching source", async () => {
    expect(await adoptSupplierLogo(null, "x.png")).toBe(false);
    expect(await adoptSupplierLogo(DOMAIN, null)).toBe(false);
    expect(await adoptSupplierLogo("zz-finns-inte.se", "x.png")).toBe(false);
  });
});
