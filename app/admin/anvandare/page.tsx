import PageHeader from "@/components/admin/PageHeader";
import FilterBar from "@/components/admin/FilterBar";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { EmptyState, Flash, StatusPill } from "@/components/admin/bits";
import { listAdminUsers, type AdminUser } from "@/lib/admin-data";
import { pool } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { handleRequestAction } from "./actions";

type Row = { key: string; href?: string; email: string; org: string | null; role: string | null; admin: boolean; active: boolean; invited: boolean; last: Date | null };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const [users, inv, reqs] = await Promise.all([
    listAdminUsers(),
    pool.query(`select i.id, i.email, i.role, o.name as org_name from invitations i join organizations o on o.id = i.org_id where i.accepted_at is null and o.active order by i.created_at desc`),
    pool.query(`select id, name, email, company, message, created_at from access_requests where handled_at is null order by created_at desc limit 50`),
  ]);
  const fromUser = (u: AdminUser): Row => ({ key: u.user_id, href: `/admin/anvandare/${u.user_id}`, email: u.email, org: u.org_name, role: u.role, admin: u.is_platform_admin, active: u.active, invited: false, last: u.last_sign_in });
  const rows: Row[] = [
    ...users.map(fromUser),
    ...inv.rows.map((i): Row => ({ key: `inv-${i.id}`, email: i.email, org: i.org_name, role: i.role, admin: false, active: true, invited: true, last: null })),
  ];
  const q = sp.q?.trim().toLowerCase();
  const shown = rows
    .filter((r) => !q || r.email.toLowerCase().includes(q) || (r.org ?? "").toLowerCase().includes(q))
    .filter((r) => !sp.status || (sp.status === "admin" ? r.admin : sp.status === "utan-bolag" ? !r.invited && !r.org : sp.status === "avstangda" ? !r.active : sp.status === "inbjuden" ? r.invited : true));

  const roleText = (r: string | null) => (r === "owner" ? "Ägare" : r === "member" ? "Medlem" : "–");
  const cols: Column<Row>[] = [
    { key: "email", header: "E-post", primary: true, cell: (r) => r.email },
    { key: "org", header: "Bolag", cell: (r) => r.org ?? "–" },
    { key: "role", header: "Roll", cell: (r) => roleText(r.role) },
    { key: "last", header: "Senast inloggad", cell: (r) => (r.last ? formatRelative(r.last.toISOString()) : "–") },
    { key: "status", header: "Status", cell: (r) => (
      <span className="flex flex-wrap gap-1.5">
        {r.invited ? <StatusPill tone="amber">Inbjuden</StatusPill> : <StatusPill tone={r.active ? "green" : "red"}>{r.active ? "Aktiv" : "Avstängd"}</StatusPill>}
        {r.admin && <StatusPill tone="dark">Admin</StatusPill>}
      </span>
    ) },
  ];
  return (
    <>
      <PageHeader title="Användare" subtitle={`${users.length} användare och ${inv.rows.length} väntande inbjudningar. Nya personer bjuds in från ett bolags sida.`} />
      <Flash ok={sp.ok} error={sp.error} />
      {reqs.rows.length > 0 && (
        <section aria-label="Förfrågningar om åtkomst" className="mb-6 rounded-3xl bg-white p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Förfrågningar om åtkomst <StatusPill tone="orange">{reqs.rows.length}</StatusPill></h2>
          <ul className="divide-y divide-line">
            {reqs.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 text-[14px]">
                  <p className="font-medium text-ink">{r.name} <span className="font-normal text-gray-500">på {r.company}</span></p>
                  <a href={`mailto:${r.email}`} className="text-gray-600 underline underline-offset-4">{r.email}</a>
                  {r.message && <p className="mt-1 whitespace-pre-line text-gray-600">{r.message}</p>}
                  <p className="mt-1 text-[12px] text-gray-500">{formatRelative(r.created_at.toISOString())}</p>
                </div>
                <form action={handleRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded-full border border-gray-200 px-4 py-1.5 text-[13px] font-medium text-ink hover:bg-gray-50">Markera hanterad</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      <FilterBar basePath="/admin/anvandare" q={sp.q} total={shown.length} noun={shown.length === 1 ? "rad" : "rader"}
        filters={[{ key: "status", label: "Filter", value: sp.status, options: [{ value: "admin", label: "Admin" }, { value: "inbjuden", label: "Inbjudna" }, { value: "utan-bolag", label: "Utan bolag" }, { value: "avstangda", label: "Avstängda" }] }]} />
      <DataTable columns={cols} rows={shown} rowKey={(r) => r.key} rowHref={(r) => r.href ?? ""} empty={<EmptyState title="Inga användare matchar" text="Ändra sökningen eller filtret." />} />
    </>
  );
}
