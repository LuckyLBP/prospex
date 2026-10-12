import Sidebar from "@/components/dashboard/Sidebar";
import { orgHasProfileAccess, requireMember } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const m = await requireMember();
  const hasProfiles = await orgHasProfileAccess(m.org.id).catch(() => false);
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink p-3 sm:p-4 lg:flex-row">
      <Sidebar isAdmin={m.isAdmin} isOwner={m.role === "owner"} orgName={m.org.name} hasProfiles={hasProfiles} />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] bg-canvas p-4 sm:p-8">{children}</div>
    </div>
  );
}
