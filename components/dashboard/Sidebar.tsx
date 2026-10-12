"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, CalendarDays, ChevronsLeft, ChevronsRight, Contact, DatabaseZap, Eye, LayoutDashboard, LayoutGrid, LibraryBig, LogOut, Menu, PhoneCall, Radar, ScanSearch, ScrollText, Shapes, ShieldCheck, Tags, Users, X } from "lucide-react";
import { signOut } from "@/app/login/actions";

const NAV = [
  { href: "/app", label: "Start", icon: LayoutGrid },
  { href: "/app/ring", label: "Ringläge", icon: PhoneCall },
  { href: "/app/kontakter", label: "Mina kontakter", icon: Contact },
  { href: "/app/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/app/leverantorer", label: "Leverantörer", icon: Building2 },
  { href: "/app/listor", label: "Listor", icon: LibraryBig },
];

type NavItem = { href: string; label: string; icon: typeof LayoutGrid; badge?: number };

/** Adminmenyn, grupperad. Visas i stället för vanliga menyn när man är i /admin. */
function adminGroups(c: { invites: number; late: number }): { title: string | null; items: NavItem[] }[] {
  return [
    { title: null, items: [{ href: "/admin", label: "Översikt", icon: LayoutDashboard }] },
    { title: "Kunder", items: [{ href: "/admin/bolag", label: "Bolag", icon: Building2 }, { href: "/admin/anvandare", label: "Användare", icon: Users, badge: c.invites }] },
    { title: "Katalog", items: [{ href: "/admin/leverantorer", label: "Leverantörer", icon: Shapes }, { href: "/admin/listor", label: "Listor", icon: LibraryBig }, { href: "/admin/kategorier", label: "Kategorier", icon: Tags }, { href: "/admin/foretagsprofil", label: "Företagsprofil", icon: ScanSearch }] },
    { title: "System", items: [{ href: "/admin/insamling", label: "Insamling", icon: DatabaseZap, badge: c.late }, { href: "/admin/logg", label: "Aktivitetslogg", icon: ScrollText }, { href: "/admin/atkomst", label: "Åtkomst", icon: Eye }] },
  ];
}

export default function Sidebar({ isAdmin, isOwner, orgName, adminCounts, hasProfiles = false }: { isAdmin: boolean; isOwner: boolean; orgName: string | null; adminCounts?: { invites: number; late: number }; hasProfiles?: boolean }) {
  const pathname = usePathname();
  const inAdmin = !!adminCounts && pathname.startsWith("/admin");
  const nav = [
    ...(orgName ? NAV : []),
    ...(hasProfiles ? [{ href: "/app/foretagsprofil", label: "Företagsprofil", icon: ScanSearch }] : []),
    ...(isOwner && orgName ? [{ href: "/app/team", label: "Team", icon: Users }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const body = (narrow: boolean, mobile: boolean) => (
    <>
      <Link href={orgName ? "/app" : "/admin"} className="mb-8 ml-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F26522] text-white">
        <Radar size={26} />
      </Link>
      {!narrow && orgName && <p className="-mt-5 mb-6 ml-1 truncate text-[12px] text-white/50">{orgName}</p>}
      {inAdmin ? (
        <nav aria-label="Admin" className="flex flex-col gap-4 overflow-y-auto">
          {orgName && (
            <Link href="/app" title="Till portalen" className="flex items-center gap-3 rounded-xl px-4 py-2 text-[14px] text-white/60 hover:text-white">
              <ArrowLeft size={18} />{!narrow && "Till portalen"}
            </Link>
          )}
          {adminGroups(adminCounts!).map((g, i) => (
            <div key={i} className="flex flex-col gap-1">
              {g.title && !narrow && <p className="px-4 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">{g.title}</p>}
              {g.items.map(({ href, label, icon: Icon, badge }) => {
                const active = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link key={href} href={href} title={label} aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] font-medium transition-colors ${active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}>
                    <Icon size={20} className={active ? "text-[#F26522]" : ""} />
                    {!narrow && <span className="flex-1">{label}</span>}
                    {!narrow && !!badge && badge > 0 && <span className="rounded-full bg-[#F26522] px-1.5 text-[11px] font-semibold leading-5 text-white">{badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      ) : (
      <nav className="flex flex-col gap-1.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={20} className={active ? "text-[#F26522]" : ""} />
              {!narrow && label}
            </Link>
          );
        })}
      </nav>
      )}
      {!mobile && (
        <button onClick={() => setCollapsed((c) => !c)} className="mt-auto flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] text-white/70 hover:text-white">
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          {!narrow && "Fäll ihop menyn"}
        </button>
      )}
      <form action={signOut} className={mobile ? "mt-auto" : ""}>
        <button title="Logga ut" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] text-white/70 hover:text-white">
          <LogOut size={18} />
          {!narrow && "Logga ut"}
        </button>
      </form>
    </>
  );

  return (
    <>
      {/* Smal skärm: en liten överdel med menyknapp, och menyn som lägger sig över sidan. */}
      <div className="flex shrink-0 items-center justify-between pb-3 lg:hidden">
        <Link href={orgName ? "/app" : "/admin"} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F26522] text-white"><Radar size={20} /></Link>
        <button onClick={() => setOpen(true)} aria-label="Öppna menyn" className="rounded-xl p-2 text-white/80 hover:bg-white/10"><Menu size={22} /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Meny">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-[#14161F] px-3 py-5">
            <button onClick={() => setOpen(false)} aria-label="Stäng menyn" className="absolute right-3 top-4 rounded-xl p-2 text-white/70 hover:bg-white/10"><X size={20} /></button>
            {body(false, true)}
          </aside>
        </div>
      )}
      <aside className={`hidden shrink-0 flex-col px-3 py-5 transition-[width] duration-300 lg:flex ${collapsed ? "w-[84px]" : "w-[250px]"}`}>{body(collapsed, false)}</aside>
    </>
  );
}
