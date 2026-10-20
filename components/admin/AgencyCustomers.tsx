import Link from "next/link";
import { ArrowUpRight, Trash2 } from "@/components/brand/icons";
import { StatusPill } from "@/components/admin/bits";
import { FormSection } from "@/components/admin/FormSection";
import type { AgencyCustomer, CustomerEvent } from "@/lib/agencies/store";
import { formatDate } from "@/lib/time";
import { removeAgencyCustomerAction, removeCustomersByTierAction } from "@/app/admin/leverantorer/actions";

const CONFIDENCE: Record<string, { label: string; tone: "green" | "amber" }> = {
  credit: { label: "Kreditrad", tone: "green" },
  "text-credit": { label: "Kreditrad utan länk", tone: "green" },
  "footer-link": { label: "Länk i sidfoten", tone: "amber" },
  contact: { label: "E-post hos byrån", tone: "green" },
  "same-server": { label: "Samma server som byråns kunder", tone: "amber" },
  fingerprint: { label: "Fingeravtryck i koden", tone: "amber" },
  portfolio: { label: "Byråns portfölj", tone: "amber" },
  backlink: { label: "Bakåtlänk (sajten blockerar oss)", tone: "amber" },
};
const VIA: Record<string, string> = { katalog: "Vår katalog", publicwww: "PublicWWW", viewdns: "ViewDNS", claude: "Claude", backlinks: "Bakåtlänkar", site: "Byråns webbplats" };
const WEAK = ["backlink", "portfolio", "fingerprint", "same-server"];

export interface CustomerView {
  rows: AgencyCustomer[];
  total: number;
  byConfidence: Record<string, number>;
  page: number;
  pageSize: number;
  tier: string | null;
  q: string | null;
  tab: "kunder" | "tidigare";
  events: CustomerEvent[];
}

const href = (slug: string, o: { tab?: string; page?: number; tier?: string | null; q?: string | null }) => {
  const p = new URLSearchParams();
  if (o.tab && o.tab !== "kunder") p.set("tab", o.tab);
  if (o.page && o.page > 1) p.set("sida", String(o.page));
  if (o.tier) p.set("bevis", o.tier);
  if (o.q) p.set("q", o.q);
  const qs = p.toString();
  return `/admin/leverantorer/${slug}${qs ? `?${qs}` : ""}`;
};

/** Byråns kunder med beviset för var och en, sidvis och med filter, samt de som slutat visa byrån. */
export default function AgencyCustomers({ supplierId, slug, view, published }: { supplierId: string; slug: string; view: CustomerView; published: boolean }) {
  const pages = Math.max(1, Math.ceil(view.total / view.pageSize));
  const tiers = Object.entries(view.byConfidence).sort((a, b) => b[1] - a[1]);
  const all = tiers.reduce((n, [, c]) => n + c, 0);
  return (
    <FormSection
      title="Kunder"
      description={published ? "Byrån är publicerad, så kunderna syns för användarna." : "Granska kunderna innan du publicerar byrån. Ta bort dem som inte stämmer, så läggs de inte tillbaka."}
    >
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Link href={href(slug, { tab: "kunder" })} className={`rounded-full px-3 py-1 font-medium ${view.tab === "kunder" ? "bg-ink text-white" : "bg-canvas text-gray-600 hover:text-ink"}`}>Kunder ({all})</Link>
        <Link href={href(slug, { tab: "tidigare" })} className={`rounded-full px-3 py-1 font-medium ${view.tab === "tidigare" ? "bg-ink text-white" : "bg-canvas text-gray-600 hover:text-ink"}`}>Tidigare kunder ({view.events.length})</Link>
      </div>

      {view.tab === "tidigare" ? (
        view.events.length === 0 ? <p className="text-[14px] text-gray-500">Ingen kund har slutat visa byrån än. Kunderna kontrolleras om vid varje körning.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-gray-400"><tr><th className="pb-2 pr-4 font-medium">Företag</th><th className="pb-2 pr-4 font-medium">Vad hände</th><th className="pb-2 font-medium">Datum</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {view.events.map((e) => (
                  <tr key={`${e.domain}-${e.at}`}>
                    <td className="py-2.5 pr-4"><p className="font-medium text-ink">{e.companyName ?? e.domain}</p>{e.companyName && <p className="text-[12px] text-gray-400">{e.domain}</p>}</td>
                    <td className="py-2.5 pr-4">{e.kind === "switched" ? <StatusPill tone="amber">{`Bytte byrå${e.toName ? ` till ${e.toName}` : ""}`}</StatusPill> : <StatusPill>Visar inte byrån längre</StatusPill>}</td>
                    <td className="py-2.5 text-gray-600">{formatDate(new Date(e.at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <Link href={href(slug, { q: view.q })} className={`rounded-full px-2.5 py-1 ${!view.tier ? "bg-accent-tint font-medium text-accent-text" : "bg-canvas text-gray-600"}`}>Alla</Link>
            {tiers.map(([t, n]) => <Link key={t} href={href(slug, { tier: t, q: view.q })} className={`rounded-full px-2.5 py-1 ${view.tier === t ? "bg-accent-tint font-medium text-accent-text" : "bg-canvas text-gray-600"}`}>{CONFIDENCE[t]?.label ?? t} ({n})</Link>)}
            <form className="ml-auto" action={`/admin/leverantorer/${slug}`}>
              {view.tier && <input type="hidden" name="bevis" value={view.tier} />}
              <input name="q" defaultValue={view.q ?? ""} placeholder="Sök företag" aria-label="Sök kund" className="rounded-full border border-gray-200 px-3 py-1 text-[12px] outline-none focus:border-accent" />
            </form>
          </div>

          {view.tier && WEAK.includes(view.tier) && view.total > 0 && (
            <form action={removeCustomersByTierAction} className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <input type="hidden" name="supplier_id" value={supplierId} /><input type="hidden" name="tier" value={view.tier} />
              <span>Den här nivån är det svagaste beviset.</span>
              <button className="font-medium underline underline-offset-4">Ta bort alla {view.byConfidence[view.tier] ?? view.total} med den</button>
            </form>
          )}

          {view.rows.length === 0 ? (
            <p className="text-[14px] text-gray-500">{view.q || view.tier ? "Inga kunder matchar." : "Inga kunder än. Kör insamlingen ovan."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[12px] text-gray-400">
                  <tr><th className="pb-2 pr-4 font-medium">Företag</th><th className="pb-2 pr-4 font-medium">Belägg</th><th className="pb-2 pr-4 font-medium">Hittad via</th><th className="pb-2 pr-4 font-medium">Hittad</th><th className="pb-2" /></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {view.rows.map((c) => {
                    const conf = c.confidence ? CONFIDENCE[c.confidence] : null;
                    return (
                      <tr key={c.companyId} className="align-top">
                        <td className="py-2.5 pr-4"><p className="font-medium text-ink">{c.name ?? c.domain}</p>{c.name && c.domain && <p className="text-[12px] text-gray-400">{c.domain}</p>}</td>
                        <td className="py-2.5 pr-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {conf && <StatusPill tone={conf.tone}>{conf.label}</StatusPill>}
                            {c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-gray-600 underline underline-offset-4 hover:text-ink">Visa sidan<ArrowUpRight size={12} /></a>}
                          </div>
                          {c.evidence && <p className="mt-1 text-[12px] text-gray-400">{c.evidence}</p>}
                        </td>
                        <td className="py-2.5 pr-4 text-gray-600">{c.via ? (VIA[c.via] ?? c.via) : "–"}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{formatDate(new Date(c.firstSeen))}</td>
                        <td className="py-2.5 text-right">
                          <form action={removeAgencyCustomerAction}>
                            <input type="hidden" name="supplier_id" value={supplierId} />
                            <input type="hidden" name="company_id" value={c.companyId} />
                            <button aria-label={`Ta bort ${c.name ?? c.domain}`} title="Ta bort kunden" className="rounded-full p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={15} /></button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <nav className="flex items-center justify-between text-[13px] text-gray-500" aria-label="Sidor">
              <span>Sida {view.page} av {pages} · {view.total} kunder</span>
              <span className="flex gap-3">
                {view.page > 1 && <Link href={href(slug, { page: view.page - 1, tier: view.tier, q: view.q })} className="font-medium text-accent-text underline underline-offset-4">Föregående</Link>}
                {view.page < pages && <Link href={href(slug, { page: view.page + 1, tier: view.tier, q: view.q })} className="font-medium text-accent-text underline underline-offset-4">Nästa</Link>}
              </span>
            </nav>
          )}
        </>
      )}
    </FormSection>
  );
}
