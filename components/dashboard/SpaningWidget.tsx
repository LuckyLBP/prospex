import Link from "next/link";
import { ArrowUpRight, ScanSearch } from "@/components/brand/icons";
import ProfileSearch from "@/components/admin/profile/ProfileSearch";
import { formatRelative } from "@/lib/format";
import { STAGE_LABEL, type orgProfiles } from "@/lib/profile/store";
import { createProfileAction, profileProgressAction, searchCompaniesAction } from "@/app/app/spaning/actions";

type Recent = Awaited<ReturnType<typeof orgProfiles>>[number];

/** Rutan på startsidan: spana på ett företag direkt härifrån, och se de senaste spaningarna. Bara för bolag som fått Spaning. */
export default function SpaningWidget({ recent }: { recent: Recent[] }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-soft">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative">
        <div className="mb-1 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-ink"><ScanSearch size={20} /></span>
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold leading-tight text-ink">Spana på ett företag</h2>
            <p className="text-[13px] text-gray-500">Gör din spaning innan du ringer.</p>
          </div>
        </div>

        <div className="mt-5">
          <ProfileSearch compact actions={{ create: createProfileAction, progress: profileProgressAction, search: searchCompaniesAction }} basePath="/app/spaning" />
        </div>

        {recent.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-medium text-gray-500">Senaste spaningar</p>
              <Link href="/app/spaning" className="inline-flex items-center gap-0.5 text-[12px] font-medium text-accent-text underline underline-offset-4">Se alla<ArrowUpRight size={12} /></Link>
            </div>
            <ul className="flex flex-col">
              {recent.map((r) => {
                const running = r.status === "queued" || r.status === "running";
                return (
                  <li key={r.id}>
                    <Link href={`/app/spaning/${r.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-canvas">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${r.status === "done" ? "bg-success" : r.status === "error" ? "bg-danger" : "animate-pulse bg-accent"}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink">{r.name ?? r.domain ?? r.input}</span>
                        <span className="block truncate text-[12px] text-gray-500">{running ? (r.stage ? `${STAGE_LABEL[r.stage]}…` : "I kö") : r.status === "error" ? "Misslyckades" : r.domain ?? ""}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-gray-400">{formatRelative(r.finished_at ?? r.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
