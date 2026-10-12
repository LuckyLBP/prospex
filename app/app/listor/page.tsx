import Link from "next/link";
import Header from "@/components/dashboard/Header";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import { requireMember } from "@/lib/auth";
import { getLists } from "@/lib/queries";

const sv = (n: number) => n.toLocaleString("sv-SE");

export default async function ListsPage() {
  await requireMember();
  const categories = await getLists();
  const total = categories.reduce((n, c) => n + c.lists.length, 0);

  return (
    <>
      <Header title="Listor" subtitle={total === 0 ? "Inga listor än" : `${total} listor i ${categories.length} kategorier`} />

      {categories.length === 0 && (
        <div className="rounded-3xl bg-white p-10 text-center text-[14px] text-gray-500">Det finns inga listor än.</div>
      )}

      <div className="flex flex-col gap-8">
        {categories.map((c) => (
          <section key={c.slug} aria-labelledby={`cat-${c.slug}`}>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#14161F] text-white"><CategoryIcon icon={c.icon} size={18} /></span>
              <div>
                <h2 id={`cat-${c.slug}`} className="text-[18px] font-semibold text-[#14161F]">{c.name}</h2>
                {c.description && <p className="text-[13px] text-gray-500">{c.description}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {c.lists.map((l) => (
                <Link key={l.slug} href={`/app/listor/${l.slug}`} className="group flex items-start gap-4 rounded-3xl bg-white p-5 transition-shadow hover:shadow-md">
                  <SupplierLogo name={l.name} logo={l.logo} size={40} fallback={<CategoryIcon icon={c.icon} size={20} />} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold text-[#14161F] group-hover:underline">{l.name}</h3>
                    {l.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-gray-500">{l.description}</p>}
                    <p className="mt-2 text-[12px] text-gray-500"><span className="font-semibold text-[#14161F]">{sv(l.n)}</span> företag · {sv(l.with_phone)} med telefon</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-8 text-[12px] text-gray-500">Listorna samlar företag i en bransch eller på en plattform, utan koppling till en leverantör.</p>
    </>
  );
}
