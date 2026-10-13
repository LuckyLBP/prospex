import { ArrowUpRight } from "@/components/brand/icons";
import { SAMPLE_ROWS, SUPPLIERS, TOTAL_COMPANIES, VERIFIED } from "@/lib/mock";

const STEPS = [
  {
    title: "Välj leverantör",
    text: "Filtrera på vilken leverantör företaget har idag, till exempel betald profil på en katalogsajt eller en webbleverantör.",
  },
  {
    title: "Avgränsa",
    text: "Snäva in på bransch, ort och län. Du ser det verkliga antalet innan du köper.",
  },
  {
    title: "Exportera",
    text: "Ladda ner en ringlista med namn, telefon, e-post och organisationsnummer. Varje rad länkar till den profil eller webbplats som visar signalen.",
  },
];

export default function HowItWorks() {
  return (
    <>
      <section id="sa-funkar-det" className="bg-white pb-12 pt-16 sm:pb-16 sm:pt-20 lg:pb-24 lg:pt-32">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-6 flex items-center gap-3 px-5 sm:mb-8 sm:px-8 lg:px-12">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white sm:h-7 sm:w-7 sm:text-[12px]">
              1
            </span>
            <span className="rounded-full border border-gray-200 px-3 py-1 text-[12px] font-medium sm:px-4 sm:py-1.5 sm:text-[13px]">
              Så funkar det
            </span>
          </div>
          <h2 className="mb-12 px-5 text-[clamp(1.5rem,4vw,3.2rem)] font-medium leading-[1.12] tracking-[-0.02em] text-gray-900 sm:mb-16 sm:px-8 lg:px-12">
            Filtrera på vad företagen
            <br className="hidden sm:block" /> köper idag, inte bara var de finns.
          </h2>
          <div className="grid grid-cols-1 gap-8 px-5 sm:px-8 md:grid-cols-3 lg:px-12">
            {STEPS.map((s, i) => (
              <div key={s.title} className="border-t border-gray-200 pt-5">
                <p className="mb-3 text-[13px] text-gray-500">0{i + 1}</p>
                <h3 className="mb-2 text-[18px] font-semibold text-gray-900">{s.title}</h3>
                <p className="text-[14px] leading-[1.65] text-gray-600 sm:text-[15px]">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-12 px-5 text-[14px] leading-[1.65] text-gray-600 sm:px-8 lg:px-12">
            Att ett företag har en betald profil eller en viss leverantör visar att budget finns, att behovet är bekräftat och att ett avtal en
            gång löper ut.
          </p>
        </div>
      </section>

      <section id="exempel" className="bg-gray-100 pb-16 pt-16 sm:pb-20 sm:pt-20 lg:pb-28 lg:pt-28">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-6 flex items-center gap-3 px-5 sm:mb-8 sm:px-8 lg:px-12">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white sm:h-7 sm:w-7 sm:text-[12px]">
              2
            </span>
            <span className="rounded-full border border-gray-300 px-3 py-1 text-[12px] font-medium sm:px-4 sm:py-1.5 sm:text-[13px]">
              Exempel på rader
            </span>
          </div>
          <h2 className="mb-4 px-5 text-[clamp(1.5rem,4vw,3.2rem)] font-medium leading-[1.12] tracking-[-0.02em] text-gray-900 sm:px-8 lg:px-12">
            Så ser en rad ut.
          </h2>
          <p className="mb-10 px-5 text-[14px] text-gray-600 sm:px-8 lg:px-12">
            Fiktiva exempel. Databasen innehåller cirka {TOTAL_COMPANIES.toLocaleString("sv-SE")} företag, verifierat {VERIFIED}.
          </p>

          <div className="px-5 sm:px-8 lg:px-12">
            <div className="overflow-x-auto rounded-2xl bg-white">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-gray-200 text-[12px] uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-3 font-medium">Företag</th>
                    <th className="px-5 py-3 font-medium">Org.nr</th>
                    <th className="px-5 py-3 font-medium">Ort</th>
                    <th className="px-5 py-3 font-medium">Signal</th>
                    <th className="px-5 py-3 font-medium">Källa</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_ROWS.map((r) => (
                    <tr key={r.orgNr} className="border-b border-gray-100 last:border-0">
                      <td className="px-5 py-3 font-medium text-gray-900">{r.company}</td>
                      <td className="px-5 py-3 text-gray-600">{r.orgNr}</td>
                      <td className="px-5 py-3 text-gray-600">{r.city}</td>
                      <td className="px-5 py-3 text-gray-900">{r.signal}</td>
                      <td className="px-5 py-3">
                        <a href="#exempel" className="inline-flex items-center gap-1 text-gray-900 underline underline-offset-4">
                          {r.source}
                          <ArrowUpRight size={13} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-gray-500">
              Leverantörer i exemplet: {SUPPLIERS.join(", ")}. Vi har ingen koppling till {SUPPLIERS.join(" eller ")}.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
