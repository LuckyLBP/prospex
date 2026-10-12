import { pool } from "@/lib/db";
import { signalNote } from "@/lib/signal-note";

// Var ett företag finns i vår egen databas: vilka källor (leverantörer och listor) som har det, med länk till
// företagets egen sida hos källan. Läses vid visning så att den inte blir gammal, och vid bygget som belägg.

export interface PresenceItem {
  slug: string;
  name: string;
  kind: "supplier" | "list";
  /** Opublicerade källor syns bara för admin. */
  published: boolean;
  logoPath: string | null;
  category: string | null;
  namesBrand: boolean;
  /** Företagets egen sida hos källan, när den finns. */
  sourceUrl: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Hur företaget hittades hos källan: "viewdns" (samma server eller namnserver), "agency" (byråns kundsökning), "publicwww" … */
  method?: string | null;
  /** Källans egen domän, när den är känd. */
  domain?: string | null;
}

/** `includeUnpublished` är till för admin, som ska se alla källor. Kundvänd användning ska lämna det av. */
export async function getPresence(companyId: string | null, opts: { includeUnpublished?: boolean } = {}): Promise<PresenceItem[]> {
  if (!companyId) return [];
  const { rows } = await pool.query(
    `select s.slug, s.name, s.kind, s.published, s.logo_path, s.method, s.domain, k.name as category, coalesce(k.names_brand, s.kind = 'supplier') as names_brand,
            cs.source_url, cs.first_seen_at, cs.last_seen_at
     from company_signals cs
     join suppliers s on s.id = cs.supplier_id and ($2::boolean or s.published)
     left join list_categories k on k.id = s.category_id
     where cs.company_id = $1
     order by (s.kind = 'supplier') desc, cs.last_seen_at desc nulls last, s.name`,
    [companyId, !!opts.includeUnpublished],
  );
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return rows.map((r) => ({
    slug: r.slug, name: r.name, kind: r.kind, published: !!r.published, logoPath: r.logo_path ?? null, category: r.category ?? null, namesBrand: !!r.names_brand,
    sourceUrl: r.source_url ?? null, firstSeen: iso(r.first_seen_at), lastSeen: iso(r.last_seen_at), method: r.method ?? null, domain: r.domain ?? null,
  }));
}

/** "Vi har ingen koppling till X eller Y." för de källor som namnger ett varumärke, enligt copy-reglerna. Tom när ingen gör det. */
export function presenceDisclaimer(items: readonly PresenceItem[]): string {
  const note = signalNote(items.map((i) => ({ supplier: i.name, kind: i.kind, names_brand: i.namesBrand })));
  return /Vi har ingen koppling till [^.]*\./.exec(note)?.[0] ?? "";
}
