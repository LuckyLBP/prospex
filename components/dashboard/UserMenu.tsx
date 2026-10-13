"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings, UserRound, Users } from "@/components/brand/icons";
import Avatar from "@/components/account/Avatar";
import { signOut } from "@/app/login/actions";

/** Namnet uppe till höger. Öppnar en meny med profil, inställningar, team, kalender och utloggning. */
export default function UserMenu({ name, email, avatarUrl, orgName, role, isOwner, defaultOpen = false }: { name: string; email: string; avatarUrl: string | null; orgName: string | null; role: "owner" | "member" | null; isOwner: boolean; /** Öppen från start, för tester och skärmbilder. */ defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const item = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] text-ink hover:bg-canvas";
  const close = () => setOpen(false);

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={email} className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 text-[14px] font-medium transition-colors hover:bg-gray-50">
        <Avatar name={name} url={avatarUrl} size={32} />
        <span className="hidden max-w-[140px] truncate sm:inline">{name}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="dialer-toast absolute right-0 top-full z-40 mt-2 w-[280px] rounded-2xl border border-gray-200 bg-white p-2 shadow-lift">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar name={name} url={avatarUrl} size={40} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">{name}</p>
              <p className="truncate text-[12px] text-gray-500">{email}</p>
              {orgName && <p className="truncate text-[12px] text-gray-500">{orgName}{role === "owner" ? " · Ägare" : role === "member" ? " · Medlem" : ""}</p>}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-1">
            <Link role="menuitem" href="/app/profil" onClick={close} className={item}><UserRound size={18} className="text-gray-500" />Min profil</Link>
            <Link role="menuitem" href="/app/installningar" onClick={close} className={item}><Settings size={18} className="text-gray-500" />Inställningar</Link>
            {isOwner && <Link role="menuitem" href="/app/team" onClick={close} className={item}><Users size={18} className="text-gray-500" />Team</Link>}
          </div>
          <form action={signOut} className="mt-1 border-t border-gray-100 pt-1">
            <button role="menuitem" className={item}><LogOut size={18} className="text-gray-500" />Logga ut</button>
          </form>
        </div>
      )}
    </div>
  );
}
