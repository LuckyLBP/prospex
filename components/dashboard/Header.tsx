import Link from "next/link";
import { Bell, ChevronDown, Plus } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { dueCallbacks } from "@/lib/workflow";
import SearchBox from "./SearchBox";

export default async function Header({ title, subtitle, icon }: { title: string; subtitle: string; icon?: React.ReactNode }) {
  const a = await getAccess();
  const due = a.org ? (await dueCallbacks(a.org.id, a.user.id, 8)).length : 0;
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {icon}
        <div className="min-w-0">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
          <p className="text-[14px] text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {a.org && <SearchBox />}
        {a.org && (
          <Link href="/app/ring" className="hidden items-center gap-2 rounded-full bg-ink px-5 py-3 text-[14px] font-semibold text-white lg:flex">
            <Plus size={16} /> Börja ringa
          </Link>
        )}
        {a.org && (
          <Link href="/app/ring?queue=callbacks" aria-label={`${due} återringningar`} title={`${due} återringningar att ringa idag`} className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700">
            <Bell size={18} />
            {due > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-ink">{due}</span>}
          </Link>
        )}
        <div title={a.user.email} className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 text-[14px] font-medium">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint text-[13px] font-semibold text-accent-text">{a.user.name.charAt(0)}</span>
          {a.user.name} <ChevronDown size={15} />
        </div>
      </div>
    </div>
  );
}
