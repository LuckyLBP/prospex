// Engångsskript: lägger in Marqeters kunder i katalogen och bygger en profil för Marqeter.
//
//   node --env-file=.env.local scripts/add-marqeter.mts

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import createJiti from "jiti";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(fileURLToPath(import.meta.url), { alias: { "@": root } });
const { pool } = jiti("@/lib/db") as typeof import("../lib/db");
const { upsertCompany } = jiti("@/lib/companies/upsert") as typeof import("../lib/companies/upsert");
const { parseProfileInput } = jiti("@/lib/profile/input") as typeof import("../lib/profile/input");
const { startProfile } = jiti("@/lib/profile/store") as typeof import("../lib/profile/store");
const { buildProfile } = jiti("@/lib/profile/build") as typeof import("../lib/profile/build");

const customers = [
  { domain: "combiclean.se", name: "Rent Combiclean i Göteborg AB", orgnr: "556752-7311" },
  { domain: "svenskaskonhetsskolan.se", name: "Svenska Skönhetsskolan AB", orgnr: null },
  { domain: "johfors.se", name: "Johfors Productions", orgnr: null },
  { domain: "lyxse.com", name: "Lyxse AB", orgnr: "559261-5701" },
  { domain: "hyssnaforestresort.com", name: "Hyssna Forest Resort", orgnr: null },
];
for (const c of customers) {
  const r = await upsertCompany({ dedupeKey: c.domain, domain: c.domain, name: c.name, orgnr: c.orgnr, website: `https://${c.domain}` });
  console.log(c.domain, r.id, r.orgnrConflict ? "(org.nr-konflikt)" : "");
}

const input = parseProfileInput("marqeter.ai");
if (input.kind !== "url") throw new Error("väntade url");
const { id } = await startProfile(input, { id: null });
console.log("profil", id);
await buildProfile(id);
const { rows } = await pool.query(`select status, name, orgnr, domain, company_id, error from company_profiles where id = $1`, [id]);
console.log(rows[0]);
await pool.end();
