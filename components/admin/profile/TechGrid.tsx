import { StatusPill } from "@/components/admin/bits";
import { siteIssues } from "@/lib/enrich/audit";
import type { TechGroup } from "@/lib/profile/tech-view";
import type { CompanyProfile } from "@/lib/profile/types";
import BrandIcon from "./BrandIcon";
import { Label, Muted } from "./parts";

/** Teknik och spår som rutor med varumärkesikoner, en grupp per kategori, plus det som är värt att notera om sajten. */
export default function TechGrid({ groups, audit }: { groups: TechGroup[]; audit: CompanyProfile["website"]["audit"] }) {
  const issues = audit ? siteIssues(audit) : [];
  if (groups.length === 0 && issues.length === 0) return <Muted>Ingen teknik hittades.</Muted>;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
      {groups.map((g) => (
        <div key={g.title}>
          <Label>{g.title}</Label>
          <ul className="flex flex-col gap-2">
            {g.tiles.map((t) => (
              <li key={t.name} className="flex items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5">
                <BrandIcon id={t.id} name={t.name} />
                <span className="min-w-0"><span className="block truncate text-[14px] font-medium text-[#14161F]">{t.name}</span>{t.detail && <span className="block truncate text-[12px] text-gray-400">{t.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      </div>
      {issues.length > 0 && (
        <div><Label>Att notera om sajten</Label><ul className="flex flex-wrap gap-1.5">{issues.map((i) => <li key={i.label}><StatusPill tone={i.outdated ? "amber" : "gray"}>{i.label}</StatusPill></li>)}</ul></div>
      )}
    </div>
  );
}
