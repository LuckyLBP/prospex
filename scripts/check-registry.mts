// Kör registerkollen (Bolagsverket) lokalt för org.nr som find-orgnr skrivit, samma anrop som körningarnas registersteg.
//
//   node --env-file=.env.local scripts/check-registry.mts [--limit N]
//
// Skriver bara registeruppgifterna, som registersteget. Nummer som Bolagsverket inte känner till listas på slutet.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import createJiti from "jiti"; // v1, kommer med tailwind

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(fileURLToPath(import.meta.url), { alias: { "@": root } });
const { pool } = jiti("@/lib/db") as typeof import("../lib/db");
const { refreshRegistry } = jiti("@/lib/bolagsverket/registry") as typeof import("../lib/bolagsverket/registry");
const { isBolagsverketConfigured, isBolagsverketTest } = jiti("@/lib/bolagsverket/client") as typeof import("../lib/bolagsverket/client");

if (!isBolagsverketConfigured() || isBolagsverketTest()) throw new Error("Bolagsverket är inte konfigurerat mot produktion.");

const i = process.argv.indexOf("--limit");
const limit = i === -1 ? 100_000 : Number(process.argv[i + 1]);
const { rows } = await pool.query<{ id: string; orgnr: string; domain: string; registry: unknown }>(
  `select id, orgnr, domain, registry from companies
    where enrichment ? 'orgnrFound' and registry_checked_at is null and orgnr is not null
    limit $1`,
  [limit],
);
console.log(`${rows.length} att kontrollera.`);

let found = 0;
const missing: string[] = [];
const failed: string[] = [];
for (const [n, r] of rows.entries()) {
  try {
    const data = await refreshRegistry(r, { withFigures: false });
    if (data.organisation) found++;
    else missing.push(`${r.orgnr}  ${r.domain}`);
  } catch (e) {
    failed.push(`${r.orgnr}  ${r.domain}  ${e instanceof Error ? e.message : e}`);
  }
  await pool.query(`update companies set registry_checked_at = now() where id = $1`, [r.id]);
  if ((n + 1) % 100 === 0) console.log(`${n + 1}/${rows.length}  i registret ${found}, okända ${missing.length}, fel ${failed.length}`);
}
console.log(`Klart: ${found} i registret, ${missing.length} okända, ${failed.length} fel.`);
if (missing.length) console.log("Okända:\n  " + missing.join("\n  "));
if (failed.length) console.log("Fel:\n  " + failed.slice(0, 20).join("\n  "));
await pool.end();
