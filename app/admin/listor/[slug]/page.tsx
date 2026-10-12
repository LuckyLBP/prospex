import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import SourceForm from "@/components/admin/SourceForm";
import { Flash, StatusPill } from "@/components/admin/bits";
import { btnPrimary, btnSecondary } from "@/components/admin/ui";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import Link from "next/link";
import { getSourceAdmin, listCategories } from "@/lib/lists-admin";
import { methodLabel } from "@/lib/runs/labels";
import { formatDate } from "@/lib/time";
import RunPanel from "@/components/admin/RunPanel";
import { updateSourceAction } from "../actions";

export default async function ListAdminPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [source, categories] = await Promise.all([getSourceAdmin(slug), listCategories()]);
  if (!source) notFound();
  if (source.kind === "supplier") redirect(`/admin/leverantorer/${slug}`);
  const cat = categories.find((c) => c.id === source.category_id);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/listor", label: "Listor" }}
        icon={<SupplierLogo name={source.name} logo={source.logo_path} size={40} fallback={<CategoryIcon icon={cat?.icon} size={20} />} />}
        title={source.name}
        subtitle={`${source.category_name ?? "Ingen kategori"} · ${source.companies.toLocaleString("sv-SE")} företag · ${methodLabel(source.method)} · senast hämtad ${source.last_seen ? formatDate(new Date(source.last_seen)) : "aldrig"}`}
        actions={<>
          <StatusPill tone={source.published ? "green" : "amber"}>{source.published ? "Publicerad" : "Opublicerad"}</StatusPill>
          {source.published && source.companies > 0 && <Link href={`/app/listor/${source.slug}`} className={btnSecondary}>Visa som kund</Link>}
          <button form="source-form" className={btnPrimary}>Spara</button>
        </>}
      />
      <Flash ok={sp.ok} error={sp.error} />
      <RunPanel source={source} returnTo={`/admin/listor/${slug}`} lastSeen={source.last_seen} />
      <SourceForm formId="source-form" action={updateSourceAction} source={source} categories={categories} kind="list" returnTo={`/admin/listor/${slug}`} />
    </>
  );
}
