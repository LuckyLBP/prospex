import { CalendarDaysDuo, Check, LibraryBigDuo, PhoneCallDuo } from "@/components/brand/icons";
import { Eyebrow, IconBadge } from "./Steps";
import { SAMPLE_ROWS } from "@/lib/mock";

const OUTCOMES = ["Svarade", "Ring igen", "Ej intresserad", "Fel nummer"];

export default function Features() {
  return (
    <section id="i-appen" className="mx-auto w-full max-w-[1200px] scroll-mt-4 px-5 pb-20 sm:px-8 lg:px-12 lg:pb-28">
      <Eyebrow>I appen</Eyebrow>
      <h2 className="max-w-[680px] text-[clamp(1.75rem,3.6vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
        Allt du behöver för att ringa, på ett ställe.
      </h2>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <div className="flex flex-col rounded-card bg-ink p-7 text-white md:col-span-2 md:p-9">
          <IconBadge icon={PhoneCallDuo} dark />
          <h3 className="mb-2 mt-6 text-[22px] font-semibold">Ringläge</h3>
          <p className="max-w-[420px] text-[15px] leading-[1.6] text-white/70">En kö med företag, ett i taget. Logga utfallet och gå vidare till nästa.</p>
          <div className="mb-9 mt-7 flex flex-wrap gap-2">
            {OUTCOMES.map((o, i) => (
              <span key={o} className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] ${i === 0 ? "bg-accent font-semibold text-ink" : "bg-white/10 text-white/80"}`}>
                {i === 0 && <Check size={14} />}{o}
              </span>
            ))}
          </div>
          <ul aria-hidden="true" className="mt-auto divide-y divide-white/10 border-t border-white/10 text-[14px]">
            {SAMPLE_ROWS.slice(1, 4).map((r) => (
              <li key={r.orgNr} className="flex items-center justify-between gap-3 py-3">
                <span className="truncate text-white/90">{r.company}</span>
                <span className="shrink-0 text-white/50">{r.city}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex-1 rounded-card bg-surface p-7 shadow-soft">
            <IconBadge icon={LibraryBigDuo} />
            <h3 className="mb-2 mt-5 text-[18px] font-semibold text-ink">Listor</h3>
            <p className="text-[15px] leading-[1.6] text-muted">Färdiga listor med filter på leverantör, bransch och ort.</p>
          </div>
          <div className="flex-1 rounded-card bg-surface p-7 shadow-soft">
            <IconBadge icon={CalendarDaysDuo} />
            <h3 className="mb-2 mt-5 text-[18px] font-semibold text-ink">Kalender</h3>
            <p className="text-[15px] leading-[1.6] text-muted">Återkomster samlas i kalendern, med påminnelse på mejl.</p>
          </div>
        </div>
      </div>
      <p className="mt-8 text-[15px] text-muted">Byggt för webb- och mediabyråer, telemarketingbolag och säljteam som säljer till små företag.</p>
    </section>
  );
}
