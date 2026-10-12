import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import SourceForm from "@/components/admin/SourceForm";
import { Flash, StatusPill } from "@/components/admin/bits";
import { btnPrimary, btnSecondary } from "@/components/admin/ui";
import SupplierLogo from "@/components/ui/SupplierLogo";
import { getSourceAdmin, listCategories } from "@/lib/lists-admin";
import { methodLabel } from "@/lib/runs/labels";
import { formatDate } from "@/lib/time";
import RunPanel from "@/components/admin/RunPanel";
import AgencyCustomers from "@/components/admin/AgencyCustomers";
import { listAgencyCustomersPage, listCustomerEvents } from "@/lib/agencies/store";
import { updateSourceAction } from "../../listor/actions";
import { profileAgencyAction } from "../actions";

export default async function SupplierAdminPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string; tab?: string; sida?: string; bevis?: string; q?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [source, categories] = await Promise.all([getSourceAdmin(slug), listCategories()]);
  if (!source) notFound();
  if (source.kind === "list") redirect(`/admin/listor/${slug}`);
  const pageNo = Math.max(1, Number(sp.sida) || 1);
  const tier = sp.bevis?.trim() || null;
  const q = sp.q?.trim() || null;
  const view = source.method === "agency"
    ? await Promise.all([listAgencyCustomersPage(source.id, { page: pageNo, pageSize: 100, confidence: tier, q }), listCustomerEvents(source.id)]).then(([list, events]) => ({ ...list, page: pageNo, pageSize: 100, tier, q, tab: (sp.tab === "tidigare" ? "tidigare" : "kunder") as "kunder" | "tidigare", events }))
    : null;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/leverantorer", label: "Leverantörer" }}
        icon={<SupplierLogo name={source.name} logo={source.logo_path} size={40} />}
        title={source.name}
        subtitle={`${source.companies.toLocaleString("sv-SE")} företag · ${methodLabel(source.method)} · senast hämtad ${source.last_seen ? formatDate(new Date(source.last_seen)) : "aldrig"}`}
        actions={<>{source.method === "agency" && <form action={profileAgencyAction}><input type="hidden" name="supplier_id" value={source.id} /><button className={btnSecondary}>Profilera byrån</button></form>}<StatusPill tone={source.published ? "green" : "amber"}>{source.published ? "Publicerad" : "Opublicerad"}</StatusPill><button form="source-form" className={btnPrimary}>Spara</button></>}
      />
      <Flash ok={sp.ok} error={sp.error} />
      <RunPanel source={source} returnTo={`/admin/leverantorer/${slug}`} lastSeen={source.last_seen} />
      {view && <div className="mb-5"><AgencyCustomers supplierId={source.id} slug={source.slug} view={view} published={source.published} /></div>}
      <SourceForm formId="source-form" action={updateSourceAction} source={source} categories={categories} kind="supplier" returnTo={`/admin/leverantorer/${slug}`} />
    </>
  );
}
