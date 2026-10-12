import Link from "next/link";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Kolumnen som bär länken till detaljsidan. */
  primary?: boolean;
  className?: string;
  align?: "left" | "right";
};

/**
 * Luftig tabell där hela raden är klickbar när `rowHref` finns (länken ligger i den primära cellen och
 * täcker raden), så att det går att tabba och öppna i ny flik som vanligt.
 */
export default function DataTable<T>({ columns, rows, rowKey, rowHref, empty }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; rowHref?: (row: T) => string; empty?: React.ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  return (
    <div className="overflow-x-auto rounded-3xl bg-white">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead>
          <tr className="border-b border-gray-100 text-[12px] uppercase tracking-wide text-gray-500">
            {columns.map((c) => <th key={c.key} className={`px-5 py-3.5 font-medium ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={`relative border-b border-gray-50 last:border-0 [transform:translateZ(0)] ${rowHref ? "hover:bg-[#FAFAF8]" : ""}`}>
              {columns.map((c) => {
                const content = c.cell(r);
                const href = rowHref && c === primary ? rowHref(r) : "";
                return (
                  <td key={c.key} className={`px-5 py-3 ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                    {href ? (
                      <Link href={href} className="font-medium text-[#14161F] after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#F26522]/50">{content}</Link>
                    ) : content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
