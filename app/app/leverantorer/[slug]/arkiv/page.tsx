import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/dashboard/Header";
import ListView, { type ListSP } from "@/components/dashboard/ListView";
import { requireMember } from "@/lib/auth";
import { getSource } from "@/lib/queries";
import SupplierLogo from "@/components/ui/SupplierLogo";

export default async function ArchivePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListSP> }) {
  const { slug } = await params;
  const m = await requireMember();
  const supplier = await getSource(slug);
  if (!supplier) notFound();
  if (supplier.kind === "list") redirect(`/app/listor/${slug}/arkiv`);
  const name = supplier.name;
  return (
    <>
      <Header icon={<SupplierLogo name={name} logo={supplier.logo} size={40} />} title={`${name}: arkiv`} subtitle="Klara företag. De raderas inte och väcks inte av nya hämtningar." />
      <div className="mb-4 flex gap-2 text-[13px]">
        <Link href={`/app/leverantorer/${slug}`} className="rounded-full bg-white px-4 py-1.5 font-medium text-gray-700 hover:bg-gray-100">Lista</Link>
        <span className="rounded-full bg-[#14161F] px-4 py-1.5 font-medium text-white">Arkiv</span>
      </div>
      <ListView orgId={m.org.id} sp={await searchParams} basePath={`/app/leverantorer/${slug}/arkiv`} fixedSupplier={slug} archived />
    </>
  );
}
