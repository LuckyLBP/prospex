import Link from "next/link";
import { ArrowRight, Check } from "@/components/brand/icons";
import PageHeader from "@/components/admin/PageHeader";
import { getCollectionRows, getOverview } from "@/lib/admin-data";
import { recentAudit } from "@/lib/audit";
import { describeAudit } from "@/lib/audit-describe";
import { formatRelative } from "@/lib/format";

const sv = (n: number) => n.toLocaleString("sv-SE");

export default async function AdminHome() {
  const [o, collection, log] = await Promise.all([getOverview(), getCollectionRows(), recentAudit(6)]);
  const late = collection.filter((c) => c.late).length;

  const todo = [
    { n: o.pending_invites, text: (n: number) => `${n} väntande ${n === 1 ? "inbjudan" : "inbjudningar"}`, href: "/admin/anvandare?status=inbjuden" },
    { n: o.orgs_without_owner, text: (n: number) => `${n} ${n === 1 ? "bolag saknar" : "bolag saknar"} ägare`, href: "/admin/bolag?status=utan-agare" },
    { n: o.unpublished_sources, text: (n: number) => `${n} ${n === 1 ? "källa är" : "källor är"} opublicerade`, href: "/admin/leverantorer?status=opublicerad" },
    { n: o.open_list_requests, text: (n: number) => `${n} ${n === 1 ? "listönskemål väntar" : "listönskemål väntar"} på granskning`, href: "/admin/leverantorer?status=opublicerad" },
    { n: o.missing_logos, text: (n: number) => `${n} ${n === 1 ? "publicerad källa saknar" : "publicerade källor saknar"} logotyp`, href: "/admin/leverantorer?status=saknar-logotyp" },
    { n: late, text: (n: number) => `${n} ${n === 1 ? "källa är" : "källor är"} försenade i insamlingen`, href: "/admin/insamling" },
  ].filter((t) => t.n > 0);

  const kpis = [
    { label: "Aktiva bolag", value: o.orgs, href: "/admin/bolag" },
    { label: "Användare", value: o.users, href: "/admin/anvandare" },
    { label: "Företag i katalogen", value: o.companies, href: "/admin/leverantorer" },
    { label: "Samtal, senaste 7 dagarna", value: o.calls_7d, href: "/admin/logg" },
  ];

  return (
    <>
      <PageHeader title="Översikt" subtitle="Läget i plattformen just nu" />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="rounded-3xl bg-white p-5 transition-shadow hover:shadow-md">
            <p className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">{sv(k.value)}</p>
            <p className="mt-2.5 text-[13px] text-gray-500">{k.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-3xl bg-white p-6">
          <h2 className="mb-4 text-[16px] font-semibold text-ink">Behöver åtgärd</h2>
          {todo.length === 0 ? (
            <p className="flex items-center gap-2 text-[14px] text-gray-600"><Check size={16} className="text-emerald-600" />Allt ser bra ut.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {todo.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="group flex items-center justify-between gap-3 py-3 text-[14px] text-gray-800 hover:text-ink">
                    <span><span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-tint px-1.5 text-[12px] font-semibold text-accent-text">{t.n}</span>{t.text(t.n).replace(/^\d+ /, "")}</span>
                    <ArrowRight size={15} className="text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-ink">Senaste aktivitet</h2>
            <Link href="/admin/logg" className="text-[13px] font-medium text-gray-500 underline underline-offset-4 hover:text-ink">Hela loggen</Link>
          </div>
          {log.length === 0 ? (
            <p className="text-[14px] text-gray-500">Ingen aktivitet än. Det som görs i admin visas här.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {log.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
                  <span className="text-gray-800">{describeAudit(r)}</span>
                  <span className="shrink-0 text-[12px] text-gray-400">{formatRelative(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
