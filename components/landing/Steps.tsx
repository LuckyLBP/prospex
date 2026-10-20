import { Building2Duo } from "@/components/brand/icons";

const STEPS = [
  { title: "Vi läser det som är offentligt", text: "Webbplatser, företagsprofiler och kataloger. En byrå som signerar webbplatsen, ett företag med betald profil eller en leverantör som syns i koden lämnar ett spår." },
  { title: "Vi kopplar spåret till företaget", text: "Varje träff matchas mot rätt företag och kontrolleras mot företagsregistret. Du får varje företag en gång, med telefon, e-post och webbplats." },
  { title: "Du får en lista att ringa", text: "Filtrera på leverantör, bransch och ort. Varje rad visar signalen och var vi hittade den." },
];

export function IconBadge({ icon: Icon, dark = false }: { icon: typeof Building2Duo; dark?: boolean }) {
  return (
    <span className={`flex h-11 w-11 items-center justify-center rounded-full ${dark ? "bg-white/10" : "bg-accent-tint"}`}>
      <Icon size={22} secondaryColor="var(--accent)" secondaryOpacity={1} className={dark ? "text-white" : "text-ink"} />
    </span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-accent-text">{children}</p>;
}

export default function Steps() {
  return (
    <section id="sa-funkar-det" className="mx-auto w-full max-w-[1200px] scroll-mt-4 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <Eyebrow>Så funkar det</Eyebrow>
      <h2 className="max-w-[900px] text-balance text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
        Vi hittar företagens kunder i offentliga data och gör listor av dem.
      </h2>
      <p className="mt-5 max-w-[680px] text-[16px] leading-[1.6] text-muted sm:text-[18px]">
        Företag lämnar spår på nätet. Vi samlar de spåren, så att du kan ringa företag som redan köper det du säljer.
      </p>

      <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
        {STEPS.map((s, i) => (
          <li key={s.title} className="border-t border-ink pt-5">
            <span className="tabular text-[13px] font-medium text-muted">0{i + 1}</span>
            <h3 className="mb-2 mt-3 text-[20px] font-semibold tracking-[-0.01em] text-ink">{s.title}</h3>
            <p className="text-[15px] leading-[1.65] text-muted">{s.text}</p>
          </li>
        ))}
      </ol>

      <p className="mt-14 max-w-[680px] text-[15px] leading-[1.6] text-muted">
        Ett företag som redan anlitar en byrå eller leverantör har budget, ett bekräftat behov och ett avtal som förr eller senare löper ut.
      </p>
    </section>
  );
}
