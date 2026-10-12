import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/dashboard/Header";
import ListView, { type ListSP } from "@/components/dashboard/ListView";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import { requireMember } from "@/lib/auth";
import { getSource } from "@/lib/queries";

export default async function ListPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListSP> }) {
  const { slug } = await params;
  const m = await requireMember();
  const source = await getSource(slug);
  if (!source) notFound();
  if (source.kind === "supplier") redirect(`/app/leverantorer/${slug}`);

  return (
    <>
      <Header
        icon={<SupplierLogo name={source.name} logo={source.logo} size={40} fallback={<CategoryIcon icon={source.category?.icon} size={20} />} />}
        title={source.name}
        subtitle={source.category ? `${source.category.name}${source.description ? ` · ${source.description}` : ""}` : (source.description ?? "Lista")}
      />
      <div className="mb-4 flex gap-2 text-[13px]">
        <span className="rounded-full bg-ink px-4 py-1.5 font-medium text-white">Lista</span>
        <Link href={`/app/listor/${slug}/arkiv`} className="rounded-full bg-white px-4 py-1.5 font-medium text-gray-700 hover:bg-gray-100">Arkiv</Link>
        <Link href="/app/listor" className="ml-auto rounded-full px-4 py-1.5 font-medium text-gray-500 hover:bg-white">Alla listor</Link>
      </div>
      <ListView orgId={m.org.id} sp={await searchParams} basePath={`/app/listor/${slug}`} fixedSupplier={slug} />
    </>
  );
}
