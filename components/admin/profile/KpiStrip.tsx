import { Coins, Layers, Share2, Star, TrendingDown, TrendingUp, Users } from "lucide-react";
import { changePercent, compactKr, ratioPercent, sv } from "@/lib/profile/format";
import type { CompanyProfile } from "@/lib/profile/types";

function Tile({ icon, label, value, sub, negative, delta }: { icon: React.ReactNode; label: string; value: string | null; sub?: string | null; negative?: boolean; delta?: { text: string; up: boolean } | null }) {
  return (
    <div className="rounded-3xl bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-gray-500"><span className="text-[#F26522]">{icon}</span>{label}</div>
      <p className={`text-[24px] font-semibold leading-none tracking-[-0.02em] ${value === null ? "text-gray-300" : negative ? "text-rose-700" : "text-[#14161F]"}`}>{value ?? "saknas"}</p>
      <p className="mt-2 min-h-[16px] text-[12px] text-gray-400">{delta ? <span className={`font-medium ${delta.up ? "text-emerald-700" : "text-rose-700"}`}>{delta.text}</span> : (sub ?? "")}</p>
    </div>
  );
}

/** Sex nyckeltal under företagskortet. Tomma värden visas som "saknas" i dämpad färg. */
export default function KpiStrip({ profile, techTotal, sources, presenceCount, hideSources = false }: { profile: CompanyProfile; techTotal: number; sources: number; presenceCount: number; hideSources?: boolean }) {
  const f = profile.registry.figures;
  const year = f?.periodEnd?.slice(0, 4);
  const margin = ratioPercent(f?.profit, f?.revenue);
  const place = profile.contact.place;
  const loss = (f?.profit ?? 0) < 0;
  const growth = changePercent(f?.revenue, f?.previous?.revenue);
  const growthDelta = growth === null || !f?.previous ? null : { text: `${growth > 0 ? "+" : ""}${growth} % mot ${f.previous.periodEnd.slice(0, 4)}`, up: growth >= 0 };
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Tile icon={<Coins size={15} />} label="Omsättning" value={compactKr(f?.revenue)} sub={year ? `Räkenskapsår ${year}` : null} delta={growthDelta} />
      <Tile icon={loss ? <TrendingDown size={15} /> : <TrendingUp size={15} />} label="Resultat" value={compactKr(f?.profit)} negative={loss} sub={margin !== null ? `${margin} % av omsättningen` : year ? `Räkenskapsår ${year}` : null} />
      <Tile icon={<Users size={15} />} label="Anställda" value={f?.employees === null || f?.employees === undefined ? null : sv(f.employees)} sub={f?.employees !== null && f?.employees !== undefined ? "Medeltal" : null} />
      <Tile icon={<Star size={15} />} label="Google-betyg" value={place?.rating != null ? place.rating.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null} sub={place?.rating != null ? (place.ratingCount ? `${place.ratingCount.toLocaleString("sv-SE")} omdömen` : "Inga omdömen") : "Ingen träff på Google"} />
      <Tile icon={<Layers size={15} />} label="Tekniker och spår" value={techTotal > 0 ? String(techTotal) : null} sub={techTotal > 0 ? "Hittade på webbplatsen och i DNS" : null} />
      <Tile icon={<Share2 size={15} />} label={hideSources ? "Plattformar" : "Kopplingar"} value={sources > 0 ? String(sources) : null} sub={hideSources ? (sources > 0 ? "Webbplatsen länkar till" : "Ingen känd än") : sources > 0 ? `${presenceCount} ${presenceCount === 1 ? "källa" : "källor"}, ${sources - presenceCount} ${sources - presenceCount === 1 ? "plattform" : "plattformar"}` : "Ingen känd än"} />
    </div>
  );
}
