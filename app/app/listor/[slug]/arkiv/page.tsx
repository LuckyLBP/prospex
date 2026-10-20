import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/dashboard/Header";
import ListView, { type ListSP } from "@/components/dashboard/ListView";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import { requireMember } from "@/lib/auth";
import { getSourceCached } from "@/lib/cached";

export default async function ListArchivePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListSP> }) {
  const { slug } = await params;
  const m = await requireMember();
  const source = await getSourceCached(slug);
  if (!source) notFound();
  if (source.kind === "supplier") redirect(`/app/leverantorer/${slug}/arkiv`);

  return (
    <>
      <Header
        icon={<SupplierLogo name={source.name} logo={source.logo} size={40} fallback={<CategoryIcon icon={source.category?.icon} size={20} />} />}
        title={`${source.name}: arkiv`}
        subtitle="Klara företag. De raderas inte och väcks inte av nya hämtningar."
      />
      <div className="mb-4 flex gap-2 text-[13px]">
        <Link href={`/app/listor/${slug}`} className="rounded-full bg-white px-4 py-1.5 font-medium text-gray-700 hover:bg-gray-100">Lista</Link>
        <span className="rounded-full bg-ink px-4 py-1.5 font-medium text-white">Arkiv</span>
      </div>
      <ListView orgId={m.org.id} sp={await searchParams} basePath={`/app/listor/${slug}/arkiv`} fixedSupplier={slug} archived />
    </>
  );
}
