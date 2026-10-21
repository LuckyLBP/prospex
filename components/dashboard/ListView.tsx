import Link from "next/link";
import { Archive, ArchiveRestore, ArrowUpRight, PhoneCall } from "@/components/brand/icons";
import OutcomeCell from "./OutcomeCell";
import SupplierFilter from "./SupplierFilter";
import SupplierLogo from "@/components/ui/SupplierLogo";
import { getSourceCached, getSourcesCached } from "@/lib/cached";
import { countCompanies, searchCompanies, type Filters } from "@/lib/queries";
import { archiveAction } from "@/app/app/actions";
import { getAccess } from "@/lib/auth";
import { checkRate } from "@/lib/access/meter";
import { LIMIT_MESSAGE } from "@/lib/access/limits";

const PAGE_SIZE = 25;

export type ListSP = { supplier?: string; city?: string; phone?: string; q?: string; page?: string };

/** Postlista med filter och (valfritt) arkivläge. Delas av leverantörs- och listsidorna. Ingen export, och inga telefonnummer eller org.nr i tabellen: de visas bara på företagets egen sida och i ringläget, där gränserna gäller (lib/access). */
export default async function ListView({
  orgId, sp, basePath, fixedSupplier, archived = false,
}: { orgId: string; sp: ListSP; basePath: string; fixedSupplier?: string; archived?: boolean }) {
  const who = await getAccess();
  const rate = await checkRate({ userId: who.user.id, orgId: orgId, isAdmin: who.isAdmin }, "list");
  if (!rate.ok) return <div className="rounded-3xl bg-white p-6 text-[14px] text-gray-700">{LIMIT_MESSAGE.minute}</div>;
  const supplier = fixedSupplier ?? (sp.supplier || undefined);
  const filters: Filters = { orgId, supplier, city: sp.city?.trim() || undefined, phoneOnly: sp.phone === "1", q: sp.q?.trim() || undefined, archive: archived ? "archived" : "active" };
  // Sidor kräver att en admin öppnat bläddringen för bolaget. Utan det ignoreras ?page= och bara första sidan visas.
  const paged = who.listAccess || who.isAdmin;
  const wanted = paged ? Math.max(1, Math.floor(Number(sp.page)) || 1) : 1;
  const [suppliers, count, source] = await Promise.all([
    fixedSupplier ? Promise.resolve([]) : getSourcesCached(),
    countCompanies(filters),
    supplier ? getSourceCached(supplier) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = Math.min(wanted, pages);
  const rows = await searchCompanies(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const name = source?.name ?? null;
  const namesBrand = source ? (source.kind === "supplier" || source.category?.names_brand === true) : false;
  const params = Object.entries({ supplier, city: sp.city, phone: sp.phone, q: sp.q }).filter(([, v]) => v) as [string, string][];
  const qs = new URLSearchParams(params).toString();
  const ringQs = new URLSearchParams(params.filter(([k]) => k === "supplier" || k === "city")).toString();
  const field = "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[14px] outline-none focus:border-accent";
  const pageHref = (n: number) => {
    const q = new URLSearchParams(params);
    if (n > 1) q.set("page", String(n));
    const s = q.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const here = pageHref(page); // arkivera/återställ landar på samma sida igen

  return (
    <>
      <form className="mb-5 grid grid-cols-1 items-end gap-4 rounded-3xl bg-white p-6 md:grid-cols-[1.2fr_1fr_1fr_auto_auto]">
        {fixedSupplier ? <input type="hidden" name="supplier" value={fixedSupplier} /> : (
          <div className="text-[12px] font-medium text-gray-500">Leverantör eller lista
            <div className="mt-1"><SupplierFilter value={sp.supplier ?? ""} suppliers={suppliers.map((s) => ({ slug: s.slug, name: s.name, n: s.n, logo: s.logo, kind: s.kind, category: s.category }))} /></div>
          </div>
        )}
        <label className="text-[12px] font-medium text-gray-500">Sök
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Namn, telefon, org.nr" className={`mt-1 ${field}`} />
        </label>
        <label className="text-[12px] font-medium text-gray-500">Ort
          <input name="city" defaultValue={sp.city ?? ""} placeholder="t.ex. Göteborg" className={`mt-1 ${field}`} />
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-[14px] text-gray-800">
          <input type="checkbox" name="phone" value="1" defaultChecked={sp.phone === "1"} className="h-4 w-4 accent-accent" />
          Bara med telefon
        </label>
        <button className="rounded-full bg-ink px-6 py-3 text-[14px] font-semibold text-white">Filtrera</button>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-ink">
          <span className="font-semibold">{count.toLocaleString("sv-SE")}</span> företag{archived ? " i arkivet" : ""}
          {name ? (source!.kind === "supplier" ? <> med {name} som leverantör</> : <> i listan {name}</>) : null}
        </p>
        {!archived && (
          <div className="flex gap-2">
            <Link href={`/app/ring${ringQs ? `?${ringQs}` : ""}`} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[14px] font-semibold text-white">
              <PhoneCall size={16} /> Starta ringläge
            </Link>
          </div>
        )}
      </div>
      {name && namesBrand && <p className="mb-4 text-[12px] text-gray-500">Vi har ingen koppling till {name}.</p>}

      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full min-w-[760px] text-left text-[14px]">
          <thead>
            <tr className="border-b border-gray-100 text-[12px] uppercase tracking-wide text-gray-500">
              {["Företag", "Ort", "Leverantör eller lista", "Utfall", "Källa", ""].map((h) => <th key={h} className="px-5 py-4 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.id}-${r.supplier}`} className="border-b border-gray-50 last:border-0">
                <td className="max-w-[240px] truncate px-5 py-3 font-medium text-ink"><Link href={`/app/foretag/${r.id}`} className="hover:underline">{r.name ?? "-"}</Link></td>
                <td className="px-5 py-3 text-gray-600">{r.city ?? "-"}</td>
                <td className="px-5 py-3 text-gray-900"><span className="flex items-center gap-2"><SupplierLogo name={r.supplier} logo={r.supplier_logo} size={24} />{r.supplier}</span></td>
                <td className="px-5 py-3"><OutcomeCell companyId={r.id} outcome={r.outcome as never} /></td>
                <td className="px-5 py-3">
                  {r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">Öppna <ArrowUpRight size={13} /></a> : "-"}
                </td>
                <td className="px-5 py-3 text-right">
                  <form action={archiveAction}>
                    <input type="hidden" name="company_id" value={r.id} />
                    <input type="hidden" name="archived" value={archived ? "0" : "1"} />
                    <input type="hidden" name="redirect_to" value={here} />
                    <button title={archived ? "Återställ" : "Arkivera"} className="text-gray-400 hover:text-ink">
                      {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-500">{archived ? "Arkivet är tomt." : "Inga företag matchar filtret."}</td></tr>}
          </tbody>
        </table>
      </div>
      {paged ? (
        <nav className="mt-4 flex items-center justify-between gap-3 text-[14px]" aria-label="Sidor">
          <p className="text-[12px] text-gray-500">Rad {(count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1).toLocaleString("sv-SE")} till {((page - 1) * PAGE_SIZE + rows.length).toLocaleString("sv-SE")} av {count.toLocaleString("sv-SE")}</p>
          <div className="flex items-center gap-2">
            {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-full bg-white px-4 py-2 font-medium text-ink hover:bg-gray-100">Föregående</Link> : <span className="rounded-full bg-white px-4 py-2 font-medium text-gray-300">Föregående</span>}
            <span className="px-2 text-gray-600">Sida {page.toLocaleString("sv-SE")} av {pages.toLocaleString("sv-SE")}</span>
            {page < pages ? <Link href={pageHref(page + 1)} className="rounded-full bg-ink px-4 py-2 font-medium text-white">Nästa</Link> : <span className="rounded-full bg-white px-4 py-2 font-medium text-gray-300">Nästa</span>}
          </div>
        </nav>
      ) : (
        <p className="mt-3 text-[12px] text-gray-500">Visar de första {rows.length} raderna av {count.toLocaleString("sv-SE")}.</p>
      )}
    </>
  );
}
