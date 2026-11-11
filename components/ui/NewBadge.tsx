import { isRecent, newCompanyTitle, recentTitle } from "@/lib/recent";

/** "Nyligen uppdaterad": visas när leverantören eller listan fått nya företag de senaste dygnen. Antalet står som hovertext. */
export default function NewBadge({ count, className = "" }: { count: number | null | undefined; className?: string }) {
  const title = recentTitle(count);
  if (!title) return null;
  return (
    <span title={title} className={`inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ${className}`}>
      Nyligen uppdaterad
    </span>
  );
}

/** "Nytt företag" på en rad: företaget lades till hos leverantören eller listan de senaste dygnen. Hovertexten säger var och när. */
export function NewCompanyBadge({ supplier, addedAt }: { supplier: string; addedAt: Date | string | null | undefined }) {
  if (!addedAt || !isRecent(addedAt)) return null;
  return (
    <span title={newCompanyTitle(supplier, addedAt)} className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
      Nytt företag
    </span>
  );
}
