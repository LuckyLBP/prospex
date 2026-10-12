import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Sidhuvud för en adminsida: valfri tillbaka-länk, titel, undertext och åtgärder till höger. */
export default function PageHeader({ title, subtitle, back, actions, icon }: {
  title: string; subtitle?: string; back?: { href: string; label: string }; actions?: React.ReactNode; icon?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 hover:text-ink">
          <ChevronLeft size={15} />{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {icon}
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
            {subtitle && <p className="text-[14px] text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
