import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../db";
import { getCards } from "./cards";

const cleanup = async () => {
  await pool.query(`delete from company_profiles where domain like 'zz-card%' or input like 'zz-card%'`);
  await pool.query(`delete from companies where dedupe_key like 'zz-card%'`);
  await pool.query(`delete from organizations where slug like 'zz-card-%'`);
};
beforeEach(cleanup);
afterAll(async () => { await cleanup(); await pool.end(); });

async function setup(access: boolean) {
  const org = (await pool.query(`insert into organizations (name, slug, profile_access) values ('Zz Card', 'zz-card-org', $1) returning id`, [access])).rows[0].id as string;
  const company = (await pool.query(`insert into companies (dedupe_key, name, phone, first_seen_at, last_seen_at) values ('zz-card:1', 'Hemtjänst i Test', '+4687654321', now(), now()) returning id`)).rows[0].id as string;
  return { org, company };
}
const addProfile = async (companyId: string | null, target: string | null, org: string, status: string, profile: unknown) => {
  const p = (await pool.query(
    `insert into company_profiles (input, input_kind, domain, status, stage, company_id, target_company_id, profile, finished_at) values ('zz-card.se', 'url', 'zz-card.se', $1, $2, $3, $4, $5::jsonb, $6) returning id`,
    [status, status === "running" ? "website" : null, companyId, target, profile ? JSON.stringify(profile) : null, status === "done" ? new Date() : null],
  )).rows[0].id as string;
  await pool.query(`insert into profile_org_access (profile_id, org_id) values ($1, $2)`, [p, org]);
  return p;
};
const PROFILE = { overview: { summary: "Ett bolag som hjälper äldre." }, contact: { people: [{ name: "Anna Berg", role: "VD", phone: "+46701234567", email: "anna@zz-card.se", photoPath: null }] }, registry: { figures: { revenue: 1000000, profit: 50000, employees: 12, periodEnd: "2025-12-31" } } };

describe("getCards with a scanned profile", () => {
  it("shows the profile, people and figures when the company has Företagsprofil", async () => {
    const { org, company } = await setup(true);
    const id = await addProfile(company, company, org, "done", PROFILE);
    const [card] = await getCards(org, [company]);
    expect(card.canScan).toBe(true);
    expect(card.profile).toMatchObject({ id, status: "done", summary: "Ett bolag som hjälper äldre.", figures: { revenue: 1000000, employees: 12, year: "2025" } });
    expect(card.profile!.people).toEqual([expect.objectContaining({ name: "Anna Berg", phone: "+46701234567", photoUrl: null })]);
  });
  it("shows a running scan before the profile has a company_id", async () => {
    const { org, company } = await setup(true);
    await addProfile(null, company, org, "running", null);
    const [card] = await getCards(org, [company]);
    expect(card.profile).toMatchObject({ status: "running", stageLabel: "Läser webbplatsen", people: [] });
  });
  it("shows nothing, and no scan button, when the company does not have Företagsprofil", async () => {
    const { org, company } = await setup(false);
    await addProfile(company, company, org, "done", PROFILE);
    const [card] = await getCards(org, [company]);
    expect(card).toMatchObject({ canScan: false, profile: null });
  });
  it("does not show another company's profile", async () => {
    const { org, company } = await setup(true);
    const other = (await pool.query(`insert into organizations (name, slug, profile_access) values ('Zz Card 2', 'zz-card-other', true) returning id`)).rows[0].id as string;
    await addProfile(company, company, other, "done", PROFILE);
    const [card] = await getCards(org, [company]);
    expect(card).toMatchObject({ canScan: true, profile: null });
  });
});
