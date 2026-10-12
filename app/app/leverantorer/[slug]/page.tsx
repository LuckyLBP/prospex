import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/dashboard/Header";
import ListView, { type ListSP } from "@/components/dashboard/ListView";
import { requireMember } from "@/lib/auth";
import { getSource } from "@/lib/queries";
import SupplierLogo from "@/components/ui/SupplierLogo";

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ListSP> }) {
  const { slug } = await params;
  const m = await requireMember();
  const supplier = await getSource(slug);
  if (!supplier) notFound();
  if (supplier.kind === "list") redirect(`/app/listor/${slug}`);
  const name = supplier.name;
  return (
    <>
      <Header icon={<SupplierLogo name={name} logo={supplier.logo} size={40} />} title={name} subtitle="Företag med den här leverantören" />
      <div className="mb-4 flex gap-2 text-[13px]">
        <span className="rounded-full bg-ink px-4 py-1.5 font-medium text-white">Lista</span>
        <Link href={`/app/leverantorer/${slug}/arkiv`} className="rounded-full bg-white px-4 py-1.5 font-medium text-gray-700 hover:bg-gray-100">Arkiv</Link>
      </div>
      <ListView orgId={m.org.id} sp={await searchParams} basePath={`/app/leverantorer/${slug}`} fixedSupplier={slug} />
    </>
  );
}
