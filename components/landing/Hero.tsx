import RollButton from "@/components/RollButton";
import ListPreview from "./ListPreview";

export default function Hero({ pill }: { pill: string | null }) {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-5 pb-16 pt-14 text-center sm:px-8 sm:pt-20 lg:px-12 lg:pb-24 lg:pt-24">
      {pill && (
        <p className="mb-6 inline-block -rotate-2 font-hand text-[21px] leading-none text-accent-text sm:text-[30px]">
          {pill}
          <svg aria-hidden="true" viewBox="0 0 200 10" preserveAspectRatio="none" className="mx-auto mt-1 block h-2 w-[92%] text-accent">
            <path d="M2 6 C 25 1, 40 9, 62 5 S 100 2, 122 6 S 168 9, 198 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </p>
      )}
      <h1 className="mx-auto max-w-[820px] text-[clamp(2.25rem,6.2vw,4.75rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">
        Ring företag som redan köper det du säljer.
      </h1>
      <p className="mx-auto mt-6 max-w-[640px] text-balance text-[16px] leading-[1.6] text-muted sm:text-[18px]">
        Prospektlistor på företag som redan köper webb och marknadsföring, med en källa på varje rad. Filtrera på leverantör, bransch och ort.
      </p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
        <RollButton
          label="Be om åtkomst"
          href="#atkomst"
          className="bg-accent py-2.5 pl-6 pr-2.5 text-[14px] text-ink hover:bg-accent-hover"
          circleClassName="h-8 w-8"
          arrowClassName="text-accent"
        />
        <a href="#sa-funkar-det" className="text-[14px] font-medium text-ink underline underline-offset-4">Så funkar det</a>
      </div>
      <ListPreview />
    </section>
  );
}
