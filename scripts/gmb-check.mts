// Går igenom företagen och kontrollerar om de har en Google-profil. Resultatet sparas i gmb_checks, och listan
// "Företag utan Google-profil" byggs av dem som saknar en.
//
//   npx tsx scripts/gmb-check.mts --limit 300            kontrollera upp till 300 nya företag, helt gratis (standard)
//   npx tsx scripts/gmb-check.mts --limit 300 --paid     använd i stället Googles betalda nivåer (Pro och Enterprise, 5 000 + 400 gratis i månaden)
//   npx tsx scripts/gmb-check.mts --limit 300 --supplier wix     bara företag ur en källa (slug)
//   npx tsx scripts/gmb-check.mts --sync                 bygg bara om listan ur det som redan kontrollerats
//   npx tsx scripts/gmb-check.mts --resort               sortera om "saknar" som visar sig ha ett platshållarnamn, utan nya anrop
//
// Standardläget (lib/gmb/free.ts) använder bara Googles kostnadsfria nivåer: autocomplete i en session som avslutas med ett
// Place Details bara på id, och textsökning bara på id. Taket GMB_AUTOCOMPLETE_MONTHLY_LIMIT skyddar mot fakturering om en
// session mot förmodan inte skulle räknas som gratis. Det betalda läget har egna tak (GMB_CHECK_MONTHLY_LIMIT, GMB_CONFIRM_MONTHLY_LIMIT).
import { pool } from "../lib/db";
import { PageBudget, safeFetch } from "../lib/profile/safe-fetch";
import { checkCompany, looksLikeBusinessName, searchEnterprise, searchPro } from "../lib/gmb/check";
import { checkCompanyFree, defaultFreeDeps } from "../lib/gmb/free";
import { syncNoProfileList } from "../lib/gmb/list";
import { reservePlacesAutocomplete, reservePlacesEnt, reservePlacesPro, usedThisMonth, PLACES_AUTOCOMPLETE_PROVIDER, PLACES_ENT_PROVIDER, PLACES_PRO_PROVIDER, placesAutocompleteLimit, placesEntLimit, placesProLimit } from "../lib/agencies/search-usage";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);
const LIMIT = Math.max(1, Math.min(5000, Number(arg("limit") ?? 300)));
const SUPPLIER = arg("supplier");
const PAID = flag("paid");

if (!process.env.GOOGLE_PLACES_API_KEY && !flag("sync")) throw new Error("GOOGLE_PLACES_API_KEY saknas");

if (flag("resort") || flag("sync")) {
  // Tidigare "saknar" vars namn är en platshållare eller bara webbadressen (reglerna blev strängare) räknas om till "osäker".
  const none = (await pool.query(`select g.company_id, c.name, c.domain from gmb_checks g join companies c on c.id = g.company_id where g.state = 'none'`)).rows;
  const bad = none.filter((r) => !looksLikeBusinessName(r.name, r.domain)).map((r) => r.company_id);
  const fakePhone = (await pool.query(`select g.company_id from gmb_checks g join companies c on c.id = g.company_id where g.state = 'none' and c.phone ~ '1234567|7654321|0000000|1111111|2222222|3333333|9999999'`)).rows.map((r) => r.company_id);
  const all = [...new Set([...bad, ...fakePhone])];
  if (all.length) await pool.query(`update gmb_checks set state = 'unsure' where company_id = any($1::uuid[])`, [all]);
  console.log(`${all.length} av ${none.length} "saknar" blev osäkra (platshållarnamn eller exempelnummer)`);
}

if (!flag("sync") && !flag("resort")) {
  // Företag med en känd träff på Google sedan tidigare räknas som att de har en profil, utan nytt anrop.
  const pre = await pool.query(
    `insert into gmb_checks (company_id, state, via, place_id, place_name, maps_url)
     select c.id, 'has', 'profile', c.places->'hit'->>'placeId', c.places->'hit'->>'name', c.places->'hit'->>'mapsUrl'
     from companies c where jsonb_typeof(c.places->'hit') = 'object' on conflict (company_id) do nothing`,
  );
  if (pre.rowCount) console.log(`${pre.rowCount} företag hade redan en känd Google-träff och markerades som att de har en profil`);

  const { rows } = await pool.query(
    `select c.id, c.name, c.domain, c.phone, c.registry->'organisation'->'address'->>'city' as city
     from companies c
     where c.name is not null and c.domain is not null and c.phone is not null
       and c.phone !~ '1234567|7654321|0000000|1111111|2222222|3333333|9999999'
       and not exists (select 1 from gmb_checks g where g.company_id = c.id)
       -- Företag som kommer från Google själva har en profil per definition.
       and not exists (select 1 from company_signals cs join suppliers s on s.id = cs.supplier_id where cs.company_id = c.id and s.method = 'googleplaces')
       and ($2::text is null or exists (select 1 from company_signals cs join suppliers s on s.id = cs.supplier_id where cs.company_id = c.id and s.slug = $2))
     order by md5(c.id::text)
     limit $1`,
    [LIMIT, SUPPLIER ?? null],
  );
  console.log(PAID
    ? `kontrollerar ${rows.length} företag${SUPPLIER ? ` ur ${SUPPLIER}` : ""} med de BETALDA nivåerna (Pro ${await usedThisMonth(PLACES_PRO_PROVIDER)}/${placesProLimit()}, andra titt ${await usedThisMonth(PLACES_ENT_PROVIDER)}/${placesEntLimit()} i månaden)`
    : `kontrollerar ${rows.length} företag${SUPPLIER ? ` ur ${SUPPLIER}` : ""} helt gratis (autocomplete ${await usedThisMonth(PLACES_AUTOCOMPLETE_PROVIDER)}/${placesAutocompleteLimit()} som skydd)`);

  const free = defaultFreeDeps();
  const tally: Record<string, number> = {};
  let i = 0, stopped = false, failed = 0;
  const homepage = async (domain: string) => (await safeFetch(`https://${domain}`, domain, new PageBudget(1, 0), "code", { maxBytes: 800_000 }).catch(() => null))?.html ?? null;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < rows.length && !stopped) {
      const c = rows[i++];
      let capHit = false;
      const company = { name: c.name, domain: c.domain, phone: c.phone, city: c.city };
      const r = PAID
        ? await checkCompany(company, {
            search: async (q) => { if (!(await reservePlacesPro())) { capHit = true; return null; } return searchPro(q); },
            confirm: async (q) => ((await reservePlacesEnt()) ? searchEnterprise(q) : null),
            homepage,
          })
        : await checkCompanyFree(company, {
            ...free,
            autocomplete: async (q, session) => { if (!(await reservePlacesAutocomplete())) { capHit = true; return null; } return free.autocomplete(q, session); },
            homepage,
          });
      if (capHit) { stopped = true; break; }
      if (!r) { failed++; continue; }
      tally[r.state] = (tally[r.state] ?? 0) + 1;
      await pool.query(
        `insert into gmb_checks (company_id, state, via, place_id, place_name, maps_url, query) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (company_id) do update set state = excluded.state, via = excluded.via, place_id = excluded.place_id, place_name = excluded.place_name, maps_url = excluded.maps_url, query = excluded.query, checked_at = now()`,
        [c.id, r.state, r.via, r.placeId, r.placeName, r.mapsUrl, r.query],
      );
      if (i % 50 === 0) console.log(`  ${i}/${rows.length}`, JSON.stringify(tally));
    }
  }));
  console.log(`klart: ${JSON.stringify(tally)}${failed ? `, ${failed} felade och tas om senare` : ""}${stopped ? " | MÅNADSTAKET NÅTT, stoppade" : ""}`);
}

const sync = await syncNoProfileList();
console.log(`listan "Företag utan Google-profil": ${sync.added} tillagda, ${sync.removed} borttagna, ${sync.total} totalt (opublicerad)`);
await pool.end();
