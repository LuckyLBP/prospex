import { ArrowUpRight, Mail, Phone, Trash2 } from "lucide-react";
import { formatSwedishPhone } from "@/lib/enrich/phone";
import { personKey, type Person } from "@/lib/profile/people";
import { removePersonAction } from "@/app/admin/foretagsprofil/actions";
import { Card } from "./parts";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

/** Personerna som företaget själv anger på sin webbplats, med titel och direkta uppgifter. Källan visas för varje person. */
export default function PeopleCard({ people, profileId, photoUrls, readOnly = false }: { people: Person[]; profileId?: string; photoUrls?: Record<string, string>; /** Bolagets vy: personerna kan inte tas bort. */ readOnly?: boolean }) {
  if (people.length === 0) return null;
  return (
    <Card title="Kontaktpersoner" note={`${people.length} ${people.length === 1 ? "person" : "personer"} · från företagets webbplats`}>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {people.map((p) => {
          const key = personKey(p.name);
          const photo = photoUrls?.[key];
          const phone = p.phone ? formatSwedishPhone(p.phone) ?? p.phone : null;
          return (
            <li key={key} className="group relative flex gap-3.5 rounded-2xl bg-[#F4F4F1] p-3.5">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" width={52} height={52} className="h-[52px] w-[52px] shrink-0 rounded-full bg-white object-cover" />
              ) : (
                <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-semibold text-gray-400" aria-hidden>{initials(p.name)}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-[#14161F]">{p.name}</p>
                {p.role && <p className="truncate text-[13px] text-gray-500">{p.role}</p>}
                <div className="mt-2 flex flex-col gap-1 text-[13px]">
                  {p.phone && <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1.5 text-[#14161F] hover:underline"><Phone size={13} className="text-[#F26522]" />{phone}</a>}
                  {p.email && <a href={`mailto:${p.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-[#14161F] hover:underline"><Mail size={13} className="shrink-0 text-[#F26522]" /><span className="truncate">{p.email}</span></a>}
                </div>
                <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-0.5 text-[12px] text-gray-400 hover:text-gray-600">Källa<ArrowUpRight size={11} /></a>
              </div>
              {!readOnly && profileId && <form action={removePersonAction} className="absolute right-2.5 top-2.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <input type="hidden" name="profile_id" value={profileId} />
                <input type="hidden" name="key" value={key} />
                <button aria-label={`Ta bort ${p.name}`} title="Ta bort personen" className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-rose-700"><Trash2 size={14} /></button>
              </form>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
