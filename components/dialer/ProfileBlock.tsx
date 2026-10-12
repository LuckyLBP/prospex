import { ArrowUpRight, Mail, Phone } from "lucide-react";
import { compactKr, sv } from "@/lib/profile/format";
import { formatSwedishPhone } from "@/lib/enrich/phone";
import { formatDateTime } from "@/lib/time";
import type { CardProfile } from "@/lib/dialer/card-types";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

/** Det en skanning hittat om företaget: personer att ringa, nyckeltal och en kort sammanfattning. */
export default function ProfileBlock({ profile }: { profile: CardProfile }) {
  const f = profile.figures;
  const facts = [
    f?.revenue != null ? `Omsättning ${compactKr(f.revenue)}` : null,
    f?.profit != null ? `Resultat ${compactKr(f.profit)}` : null,
    f?.employees != null ? `${sv(f.employees)} anställda` : null,
  ].filter(Boolean);

  return (
    <section className="border-t border-gray-100 pt-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-[#14161F]">Skannad profil</h3>
        {profile.finishedAt && <span className="text-[12px] text-gray-400">{formatDateTime(new Date(profile.finishedAt))}</span>}
      </div>

      {profile.summary && <p className="mb-3 text-[14px] leading-relaxed text-gray-700">{profile.summary}</p>}
      {facts.length > 0 && <p className="mb-3 text-[13px] text-gray-500">{facts.join(" · ")}{f?.year ? ` (${f.year})` : ""}</p>}

      {profile.people.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {profile.people.map((p) => (
            <li key={p.key} className="flex items-center gap-3 rounded-2xl bg-[#F7F7F4] p-2.5">
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photoUrl} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full bg-white object-cover" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[14px] font-semibold text-gray-400" aria-hidden>{initials(p.name)}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[#14161F]">{p.name}</p>
                {p.role && <p className="truncate text-[12px] text-gray-500">{p.role}</p>}
                {p.phone && <p className="truncate text-[12px] text-gray-500">{formatSwedishPhone(p.phone) ?? p.phone}</p>}
              </div>
              {p.phone && <a href={`tel:${p.phone}`} aria-label={`Ring ${p.name}`} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#14161F] px-3.5 text-[13px] font-semibold text-white"><Phone size={14} className="text-[#F26522]" />Ring {p.name.split(" ")[0]}</a>}
              {p.email && !p.phone && <a href={`mailto:${p.email}`} aria-label={`Mejla ${p.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700"><Mail size={15} /></a>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-gray-500">Inga kontaktpersoner hittades på webbplatsen.</p>
      )}

      <a href={`/app/foretagsprofil/${profile.id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[#C2490C] underline underline-offset-4">Öppna hela profilen<ArrowUpRight size={13} /></a>
    </section>
  );
}
