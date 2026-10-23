import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { learnedTraceTokens, listCheckedPage, loadChecked, recordChecked } from "./store";
import { VERIFY_RULES } from "./verify";

// Spår som styrkt många kunder, och reglerversionen på kontrollerna. Egna testrader som städas bort efteråt.
const SLUG = "zz-learned-itest";
let supplierId = "";

async function clean() {
  await pool.query(`delete from companies where dedupe_key like 'zz-learned-%'`);
  await pool.query(`delete from suppliers where slug = $1`, [SLUG]);
}
async function customer(n: number, raw: Record<string, unknown>) {
  const c = (await pool.query(`insert into companies (dedupe_key, domain, name) values ($1, $2, $3) returning id`, [`zz-learned-${n}`, `zz-learned-${n}.se`, `Kund ${n}`])).rows[0].id;
  await pool.query(`insert into company_signals (company_id, supplier_id, source_url, raw) values ($1, $2, $3, $4)`, [c, supplierId, `https://zz-learned-${n}.se/`, JSON.stringify(raw)]);
}

beforeAll(async () => {
  await clean();
  supplierId = (await pool.query(`insert into suppliers (id, slug, name, kind, published, domain, method) values (gen_random_uuid(), $1, 'Learned Test', 'supplier', false, 'zz-learned.se', 'agency') returning id`, [SLUG])).rows[0].id;
  // Sex kunder har samma spår, i nya och gamla format; fyra har ett annat; en saknar spår; och en kund med ett kreditbelägg.
  for (let i = 0; i < 3; i++) await customer(i, { confidence: "fingerprint", evidence: "Kod: zz_learn_token_a", trace: { kind: "identifier", token: "zz_learn_token_a" } });
  for (let i = 3; i < 6; i++) await customer(i, { confidence: "fingerprint", evidence: "Kod: zz_learn_token_a" });
  for (let i = 6; i < 10; i++) await customer(i, { confidence: "fingerprint", evidence: "Kod: zz_other_token", trace: { kind: "identifier", token: "zz_other_token" } });
  await customer(10, { confidence: "fingerprint", evidence: "Anrop till zz-learned.se", trace: { kind: "endpoint", token: "zz-learned.se" } });
  await customer(11, { confidence: "credit", evidence: "Sidfoten anger Learned" });
});
afterAll(async () => {
  await clean();
  await pool.end();
});

describe("learnedTraceTokens", () => {
  it("gives the searchable traces that proved at least five customers, most first, and ignores the rest", async () => {
    expect(await learnedTraceTokens(supplierId)).toEqual(["zz_learn_token_a"]);
  });
  it("does not offer an address or comment as a search, however common it is", async () => {
    for (let i = 20; i < 30; i++) await customer(i, { confidence: "fingerprint", evidence: "Anrop till zz-learned.se", trace: { kind: "endpoint", token: "zz-learned.se" } });
    expect(await learnedTraceTokens(supplierId)).toEqual(["zz_learn_token_a"]);
  });
});

describe("rule version on checks", () => {
  it("stores the current version with a verdict and reads it back", async () => {
    await recordChecked(supplierId, [{ domain: "zz-learned-x.se", verdict: "no-credit", misses: 0 }]);
    const row = (await loadChecked(supplierId)).get("zz-learned-x.se");
    expect(row).toMatchObject({ verdict: "no-credit", rules: VERIFY_RULES });
  });
});

describe("listCheckedPage", () => {
  it("lists checked domains that were not accepted, filtered by verdict and search, with counts per verdict", async () => {
    await recordChecked(supplierId, [
      { domain: "zz-learned-ok.se", verdict: "accepted", misses: 0 },
      { domain: "zz-learned-nc1.se", verdict: "no-credit", misses: 0 },
      { domain: "zz-learned-nc2.se", verdict: "no-credit", misses: 1 },
      { domain: "zz-learned-dead.se", verdict: "unreachable", misses: 0 },
    ]);
    const all = await listCheckedPage(supplierId);
    expect(all.rows.map((r) => r.domain)).not.toContain("zz-learned-ok.se");
    expect(all.byVerdict).toMatchObject({ "no-credit": 3, unreachable: 1 });
    expect(all.byVerdict.accepted).toBeUndefined();

    const noCredit = await listCheckedPage(supplierId, { verdict: "no-credit" });
    expect(noCredit.total).toBe(3);
    expect(noCredit.rows.every((r) => r.verdict === "no-credit")).toBe(true);

    const searched = await listCheckedPage(supplierId, { verdict: "no-credit", q: "NC2" });
    expect(searched.rows).toEqual([expect.objectContaining({ domain: "zz-learned-nc2.se", misses: 1 })]);
  });
});
