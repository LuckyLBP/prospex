import { Globe, Mail, Phone } from "@/components/brand/icons";
import { SAMPLE_ROWS } from "@/lib/mock";
import { CompanyLogo } from "./CompanyLogo";

const ACTIONS = [
  { icon: Phone, label: "Ring", primary: true },
  { icon: Mail, label: "Mejla", primary: false },
  { icon: Globe, label: "Webbplats", primary: false },
];

/** En lista som i appen: en rad per företag, med logotyp, signal och knappar för att ringa, mejla och öppna webbplatsen. Fiktiva företag, inget går att klicka på. */
export default function ListPreview() {
  return (
    <figure aria-label="Exempel på en lista" className="mt-14 w-full sm:mt-16">
      <div className="overflow-hidden rounded-card bg-surface text-left shadow-lift">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12px] font-medium text-muted">
              <th className="px-5 py-3.5 font-medium sm:px-7">Företag</th>
              <th className="hidden px-3 py-3.5 font-medium sm:table-cell">Ort</th>
              <th className="hidden px-3 py-3.5 font-medium md:table-cell">Signal</th>
              <th className="px-5 py-3.5 text-right font-medium sm:px-7"><span className="sr-only">Kontakt</span></th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ROWS.slice(0, 4).map((r, i) => {
              const signal = r.signal.replace("Webbplats skapad av ", "Skapad av ");
              return (
                <tr key={r.orgNr} className="border-b border-line last:border-0">
                  <td className="px-5 py-4 sm:px-7">
                    <div className="flex items-center gap-4">
                      <CompanyLogo i={i} />
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{r.company}</p>
                        <p className="tabular mt-0.5 text-[12px] text-muted">{r.orgNr}<span className="sm:hidden"> · {r.city}</span></p>
                        <span className="mt-1.5 inline-flex whitespace-nowrap rounded-full bg-accent-tint px-2.5 py-0.5 text-[12px] font-medium text-accent-text md:hidden">{signal}</span>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-4 text-muted sm:table-cell">{r.city}</td>
                  <td className="hidden px-3 py-4 md:table-cell"><span className="inline-flex whitespace-nowrap rounded-full bg-accent-tint px-2.5 py-0.5 text-[12px] font-medium text-accent-text">{signal}</span></td>
                  <td className="w-px whitespace-nowrap py-4 pl-2 pr-5 sm:px-7">
                    <div className="flex justify-end gap-1.5 sm:gap-2">
                      {ACTIONS.map(({ icon: Icon, label, primary }, n) => (
                        <span key={label} title={label} className={`h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10 ${n === 0 ? "flex" : "hidden sm:flex"} ${primary ? "bg-accent text-white" : "border border-line bg-canvas text-ink"}`}>
                          <Icon size={18} />
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-4 text-center text-[12px] text-muted">Fiktiva företag, för att visa hur en lista ser ut.</figcaption>
    </figure>
  );
}
