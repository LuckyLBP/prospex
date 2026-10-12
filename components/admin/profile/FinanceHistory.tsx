import { compactKr } from "@/lib/profile/format";
import type { AnnualFigures, YearFigures } from "@/lib/bolagsverket/types";

/** Omsättning och resultat år för år, äldst först. Visas bara när det finns minst två år med omsättning. */
export default function FinanceHistory({ figures }: { figures: AnnualFigures }) {
  const years: YearFigures[] = [figures, ...(figures.previous ? [figures.previous] : []), ...(figures.history ?? [])]
    .filter((y) => y.revenue !== null)
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  if (years.length < 2) return null;
  const max = Math.max(...years.map((y) => Math.abs(y.revenue ?? 0)), 1);
  return (
    <div className="rounded-2xl border border-gray-100 px-4 py-3">
      <p className="mb-3 text-[13px] font-medium text-gray-500">Omsättning och resultat per år</p>
      <ul className="flex flex-col gap-2.5">
        {years.map((y) => (
          <li key={y.periodEnd} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
            <span className="text-gray-500">{y.periodEnd.slice(0, 4)}</span>
            <div className="h-2 rounded-full bg-[#F4F4F1]" role="img" aria-label={`Omsättning ${y.periodEnd.slice(0, 4)}: ${compactKr(y.revenue)}`}>
              <div className="h-2 rounded-full bg-[#F26522]" style={{ width: `${Math.max(2, (Math.abs(y.revenue ?? 0) / max) * 100)}%` }} />
            </div>
            <span className="text-right text-[#14161F]"><span className="font-semibold">{compactKr(y.revenue)}</span>{y.profit !== null && <span className={`ml-2 ${y.profit < 0 ? "text-rose-700" : "text-gray-400"}`}>{compactKr(y.profit)}</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
