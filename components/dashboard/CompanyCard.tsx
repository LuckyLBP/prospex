import { ArrowUpRight, Globe, Mail, MapPin, Phone } from "lucide-react";
import type { Company } from "@/lib/workflow";
import SupplierLogo from "@/components/ui/SupplierLogo";
import CategoryIcon from "@/components/ui/CategoryIcon";
import { signalNote } from "@/lib/signal-note";

export default function CompanyCard({ company }: { company: Company }) {
  const suppliers = [...new Set(company.signals.map((s) => s.supplier))];
  return (
    <div className="rounded-3xl bg-white p-6 sm:p-8">
      <div className="mb-4 flex flex-wrap gap-2">
        {company.signals.map((s) => (
          <span key={s.supplier} className="inline-flex items-center gap-2 rounded-full bg-[#F4F4F1] py-1 pl-1.5 pr-3 text-[12px] font-medium text-gray-800">
            <SupplierLogo name={s.supplier} logo={s.logo} size={24} fallback={s.kind === "list" ? <CategoryIcon icon={s.icon} size={13} /> : undefined} />
            {s.supplier}
            {s.source_url && (
              <a href={s.source_url} target="_blank" rel="noreferrer" aria-label={`Källa för ${s.supplier}`} className="text-[#F26522]">
                <ArrowUpRight size={13} />
              </a>
            )}
          </span>
        ))}
      </div>

      <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-semibold leading-tight tracking-[-0.02em] text-[#14161F]">{company.name ?? "Okänt företag"}</h2>

      {company.phone ? (
        <a href={`tel:${company.phone}`} className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-[#14161F] px-5 py-3 text-[22px] font-semibold text-white">
          <Phone size={20} className="text-[#F26522]" />
          {company.phone}
        </a>
      ) : (
        <p className="mt-4 text-[14px] text-gray-500">Telefonnummer saknas.</p>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-3 text-[14px] sm:grid-cols-2">
        {company.city && (
          <div className="flex items-center gap-2 text-gray-700"><MapPin size={16} className="text-gray-400" />{company.city}</div>
        )}
        {company.orgnr && <div className="text-gray-700"><span className="text-gray-400">Org.nr </span>{company.orgnr}</div>}
        {company.website && (
          <a href={company.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-gray-700 underline underline-offset-4">
            <Globe size={16} className="text-gray-400" />{company.website.replace(/^https?:\/\//, "")}
          </a>
        )}
        {company.email && (
          <a href={`mailto:${company.email}`} className="flex items-center gap-2 text-gray-700 underline underline-offset-4">
            <Mail size={16} className="text-gray-400" />{company.email}
          </a>
        )}
        {company.sni && <div className="text-gray-700 sm:col-span-2"><span className="text-gray-400">Bransch </span>{company.sni}</div>}
      </dl>

      <p className="mt-6 text-[12px] text-gray-500">
        {signalNote(company.signals)} Källlänken visar var signalen syns.
      </p>
    </div>
  );
}
