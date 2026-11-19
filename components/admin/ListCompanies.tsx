import Link from "next/link";
import DataTable, { type Column } from "./DataTable";
import { EmptyState } from "./bits";
import type { AdminListCompany } from "@/lib/lists-admin";
import { googleMapsSearchUrl } from "@/lib/gmb/links";
import { formatDate } from "@/lib/time";

/**
 * Företagen i en lista, för plattformsadmin. Visas också när listan är opublicerad, med telefon och det som sparats vid
 * posten. För listan över företag utan Google-profil finns när det kontrollerades och en länk som söker företaget på Google
 * Maps, så att en träff går att kontrollera för hand.
 */
export default function ListCompanies({ basePath, rows, total, page, pages, q }: { basePath: string; rows: AdminListCompany[]; total: number; page: number; pages: number; q: string }) {
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (p > 1) s.set("sida", String(p));
    const qs = s.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const gmb = rows.some((r) => r.raw?.via === "gmb-check");
  const cols: Column<AdminListCompany>[] = [
    { key: "name", header: "Företag", primary: false, cell: (r) => <span className="font-medium text-ink">{r.name ?? "–"}</span> },
    { key: "site", header: "Webbplats", cell: (r) => (r.domain ? <a href={r.website ?? `https://${r.domain}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">{r.domain}</a> : "–") },
    { key: "phone", header: "Telefon", cell: (r) => r.phone ?? "–" },
    ...(gmb
      ? [
          { key: "checked", header: "Kontrollerad", cell: (r: AdminListCompany) => (r.raw?.checked_at ? formatDate(new Date(String(r.raw.checked_at))) : "–") } as Column<AdminListCompany>,
          { key: "maps", header: "Kontrollera själv", cell: (r: AdminListCompany) => (
            <a href={googleMapsSearchUrl(String(r.raw?.query ?? r.name ?? r.domain ?? ""))} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">Sök på Google Maps</a>
          ) } as Column<AdminListCompany>,
        ]
      : [{ key: "evidence", header: "Belägg", cell: (r: AdminListCompany) => (r.raw?.evidence ? String(r.raw.evidence) : r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">Öppna</a> : "–") } as Column<AdminListCompany>]),
  ];
  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink">Företag i listan</h2>
          <p className="text-[13px] text-gray-500">{total.toLocaleString("sv-SE")} företag{q ? ` som matchar "${q}"` : ""}. Du ser dem även om listan inte är publicerad.</p>
        </div>
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Namn, domän, telefon" className="w-56 rounded-full border border-gray-200 bg-white px-4 py-2 text-[13px] outline-none focus:border-accent" />
          <button className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white">Sök</button>
          {q && <Link href={basePath} className="rounded-full px-3 py-2 text-[13px] text-gray-500 hover:text-ink">Rensa</Link>}
        </form>
      </div>
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={<EmptyState title={q ? "Inga företag matchar" : "Inga företag än"} text={q ? "Prova ett annat namn eller en annan domän." : "Listan har inga företag än."} />} />
      {pages > 1 && (
        <nav className="mt-3 flex items-center justify-between text-[13px]" aria-label="Sidor">
          <span className="text-gray-500">Sida {page.toLocaleString("sv-SE")} av {pages.toLocaleString("sv-SE")}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={href(page - 1)} className="rounded-full bg-white px-4 py-2 font-medium text-ink hover:bg-gray-100">Föregående</Link> : <span className="rounded-full bg-white px-4 py-2 text-gray-300">Föregående</span>}
            {page < pages ? <Link href={href(page + 1)} className="rounded-full bg-ink px-4 py-2 font-medium text-white">Nästa</Link> : <span className="rounded-full bg-white px-4 py-2 text-gray-300">Nästa</span>}
          </div>
        </nav>
      )}
    </section>
  );
}
