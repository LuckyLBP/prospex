import { pool } from "@/lib/db";
import { imageKind, uploadLogoBytes } from "@/lib/storage";
import { slugify } from "@/lib/slug";
import { agencyKey } from "./creator";
import { logoCandidates } from "./logo-candidates";
import { PageBudget, safeFetch, safeFetchBytes } from "./safe-fetch";

// Hittar en logotyp åt en byrå eller ett företag, i den här ordningen:
//   1. en källa i vår katalog med samma domän eller namn, då återanvänds dess logotyp
//   2. en redan hämtad logotyp för domänen (web_logos), så att samma domän inte hämtas två gånger
//   3. webbplatsens egen: startsidans kandidater (logo-candidates.ts), den första som är en giltig bild
// Allt som går fel ger "ingen logotyp", aldrig ett fel som stoppar profilen.

const MIN_BYTES = 256;
const MAX_CANDIDATES = 5;
/** En miss (ingen logotyp hittad) provas om först efter en vecka, en träff behålls i en månad. */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface LogoResult {
  path: string | null;
  source: "supplier" | "cache" | "fetched" | "none";
  supplierSlug: string | null;
}

export interface LogoDeps {
  findSupplier: (domain: string, name: string | null) => Promise<{ slug: string; logo_path: string | null } | null>;
  getCached: (domain: string) => Promise<{ path: string | null; fetchedAt: Date } | null>;
  saveCache: (domain: string, path: string | null, source: string | null) => Promise<void>;
  fetchHome: (domain: string) => Promise<{ html: string; finalUrl: string } | null>;
  fetchBytes: typeof safeFetchBytes;
  upload: (name: string, bytes: Uint8Array) => Promise<string>;
  now: () => number;
}

export const defaultLogoDeps: LogoDeps = {
  async findSupplier(domain, name) {
    const { rows } = await pool.query(
      `select slug, logo_path from suppliers where published and (domain = $1 or ($2::text is not null and (lower(name) = lower($2) or slug = $3 or slug = $4)))
       order by (domain = $1) desc, (logo_path is not null) desc limit 1`,
      [domain, name, name ? slugify(name) : null, name ? slugify(agencyKey(name)) : null],
    );
    return rows[0] ?? null;
  },
  async getCached(domain) {
    const { rows } = await pool.query(`select path, fetched_at from web_logos where domain = $1`, [domain]);
    return rows[0] ? { path: rows[0].path, fetchedAt: new Date(rows[0].fetched_at) } : null;
  },
  async saveCache(domain, path, source) {
    await pool.query(
      `insert into web_logos (domain, path, source, fetched_at) values ($1,$2,$3, now()) on conflict (domain) do update set path = excluded.path, source = excluded.source, fetched_at = now()`,
      [domain, path, source],
    );
  },
  async fetchHome(domain) {
    const page = await safeFetch(`https://${domain}`, domain, new PageBudget(2, 0));
    return page.html ? { html: page.html, finalUrl: page.finalUrl } : null;
  },
  fetchBytes: safeFetchBytes,
  upload: uploadLogoBytes,
  now: Date.now,
};

export async function resolveLogo(input: { name?: string | null; domain: string | null; useCatalog?: boolean }, deps: LogoDeps = defaultLogoDeps): Promise<LogoResult> {
  const none: LogoResult = { path: null, source: "none", supplierSlug: null };
  const domain = input.domain?.toLowerCase().replace(/^www\./, "") ?? null;
  if (!domain && !input.name) return none;

  let supplierSlug: string | null = null;
  if (input.useCatalog !== false) {
    const supplier = await deps.findSupplier(domain ?? "", input.name ?? null).catch(() => null);
    if (supplier) {
      supplierSlug = supplier.slug;
      if (supplier.logo_path) return { path: supplier.logo_path, source: "supplier", supplierSlug };
    }
  }
  if (!domain) return { ...none, supplierSlug };

  const cached = await deps.getCached(domain).catch(() => null);
  if (cached) {
    const age = deps.now() - cached.fetchedAt.getTime();
    if (cached.path && age < HIT_TTL_MS) return { path: cached.path, source: "cache", supplierSlug };
    if (!cached.path && age < MISS_TTL_MS) return { ...none, supplierSlug };
  }

  try {
    const home = await deps.fetchHome(domain);
    if (home) {
      for (const url of logoCandidates(home.html, home.finalUrl).slice(0, MAX_CANDIDATES)) {
        const got = await deps.fetchBytes(url);
        if (!got.ok || !got.bytes || got.bytes.byteLength < MIN_BYTES || !imageKind(got.bytes)) continue;
        const path = await deps.upload(`web-${domain}`, got.bytes);
        await deps.saveCache(domain, path, url).catch(() => {});
        return { path, source: "fetched", supplierSlug };
      }
    }
  } catch {
    /* ingen logotyp är ett giltigt svar */
  }
  await deps.saveCache(domain, null, null).catch(() => {});
  return { ...none, supplierSlug };
}
