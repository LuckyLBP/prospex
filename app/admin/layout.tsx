import Sidebar from "@/components/dashboard/Sidebar";
import { requireAdmin } from "@/lib/auth";
import { adminNavCounts } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const counts = await adminNavCounts();
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink p-3 sm:p-4 lg:flex-row">
      <Sidebar isAdmin orgName={a.org?.name ?? null} isOwner={a.role === "owner"} adminCounts={counts} />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] bg-canvas p-5 sm:p-8">
        <main className="mx-auto max-w-[1180px]">{children}</main>
      </div>
    </div>
  );
}
