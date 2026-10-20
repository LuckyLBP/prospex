import { requestAccess } from "@/app/actions";
import { Check } from "@/components/brand/icons";

const input = "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-ink outline-none placeholder:text-gray-400 focus:border-accent";

function waitText(sec: number) {
  if (!(sec > 0)) return "en liten stund";
  return sec < 90 ? `${sec} sekunder` : sec < 3600 ? `${Math.ceil(sec / 60)} minuter` : "en timme";
}

export default function AccessForm({ status, wait }: { status?: string; wait?: string }) {
  const sent = status === "skickad";
  return (
    <section id="atkomst" className="scroll-mt-4">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:px-12 lg:py-24">
        <div>
          <h2 className="text-[clamp(1.75rem,3.6vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-white">Be om åtkomst.</h2>
          <p className="mt-4 max-w-[420px] text-[16px] leading-[1.6] text-white/70">
            Prospex är öppet för inbjudna team. Berätta vem du är och vad du säljer, så hör vi av oss.
          </p>
        </div>

        {sent ? (
          <div role="status" className="flex items-start gap-3 self-start rounded-card bg-canvas p-6 text-ink">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent"><Check size={16} /></span>
            <div>
              <p className="text-[17px] font-semibold">Tack, vi har tagit emot din förfrågan.</p>
              <p className="mt-1 text-[14px] text-muted">Vi hör av oss till din e-post så snart vi har tittat på den.</p>
            </div>
          </div>
        ) : (
          <form action={requestAccess} className="flex flex-col gap-3 rounded-card bg-canvas p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">Namn
                <input name="name" required maxLength={120} autoComplete="name" className={input} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">Företag
                <input name="company" required maxLength={160} autoComplete="organization" className={input} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">E-post
              <input type="email" name="email" required maxLength={200} autoComplete="email" placeholder="namn@foretag.se" className={input} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink"><span>Vad säljer du? <span className="font-normal text-muted">(valfritt)</span></span>
              <textarea name="message" rows={3} maxLength={1000} className={input} />
            </label>
            {/* Fälla för bottar: människor ser och fyller aldrig i det här fältet. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Webbplats<input name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>
            {status === "fel" && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">Kontrollera att alla fält är ifyllda och att e-postadressen stämmer.</p>}
            {status === "vanta" && <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">Du har skickat flera förfrågningar på kort tid. Försök igen om {waitText(Number(wait))}.</p>}
            <button className="mt-1 rounded-full bg-accent px-6 py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-accent-hover">Skicka förfrågan</button>
            <p className="text-center text-[12px] text-muted">Vi använder uppgifterna bara för att svara dig.</p>
          </form>
        )}
      </div>
    </section>
  );
}
