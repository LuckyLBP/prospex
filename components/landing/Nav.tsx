import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

const LINKS = [
  { label: "Så funkar det", href: "#sa-funkar-det" },
  { label: "I appen", href: "#i-appen" },
];

export default function Nav() {
  return (
    <nav aria-label="Huvudmeny" className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
      <div className="flex items-center gap-8">
        <Link href="/" aria-label="Prospex"><Logo height={52} className="-ml-1" /></Link>
        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-[14px] text-muted transition-colors hover:text-ink">{l.label}</a>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/login" className="hidden text-[14px] font-medium text-ink underline-offset-4 hover:underline sm:block">Logga in</Link>
        <a href="#atkomst" className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-gray-800">Be om åtkomst</a>
      </div>
    </nav>
  );
}
