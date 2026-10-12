import Link from "next/link";
import Header from "@/components/dashboard/Header";
import { getSuppliers } from "@/lib/queries";
import SupplierLogo from "@/components/ui/SupplierLogo";
import { requireMember } from "@/lib/auth";

export default async function SuppliersPage() {
  await requireMember();
  const suppliers = await getSuppliers();
  return (
    <>
      <Header title="Leverantörer" subtitle={`${suppliers.length} leverantörer med signal i databasen`} />
      <div className="overflow-x-auto rounded-3xl bg-white">
        <table className="w-full min-w-[560px] text-left text-[14px]">
          <thead>
            <tr className="border-b border-gray-100 text-[12px] uppercase tracking-wide text-gray-500">
              <th className="px-6 py-4 font-medium">Leverantör</th>
              <th className="px-6 py-4 font-medium">Företag</th>
              <th className="px-6 py-4 font-medium">Med telefon</th>
              <th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.slug} className="border-b border-gray-50 last:border-0">
                <td className="px-6 py-2.5 font-medium text-ink"><Link href={`/app/leverantorer/${s.slug}`} className="flex items-center gap-3 hover:underline"><SupplierLogo name={s.name} logo={s.logo} size={32} />{s.name}</Link></td>
                <td className="px-6 py-3 text-gray-700">{s.n.toLocaleString("sv-SE")}</td>
                <td className="px-6 py-3 text-gray-700">{s.with_phone.toLocaleString("sv-SE")}</td>
                <td className="px-6 py-3 text-right">
                  <Link href={`/app/leverantorer/${s.slug}`} className="text-[13px] font-medium underline underline-offset-4">
                    Öppna
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[12px] text-gray-500">Leverantörer visas som text. Vi har ingen koppling till någon namngiven leverantör. Företag i en bransch eller på en plattform finns under <Link href="/app/listor" className="underline underline-offset-4">Listor</Link>.</p>
    </>
  );
}
