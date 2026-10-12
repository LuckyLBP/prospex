import RollButton from "./RollButton";

const ITEMS = [
  {
    title: "Webb- och mediabyråer",
    text: "Hitta företag som redan betalar en leverantör för samma tjänst som du säljer, och som har ett avtal som förr eller senare löper ut.",
  },
  {
    title: "Telemarketingbolag och säljteam",
    text: "Färska ringlistor med bekräftad aktivitet på företagen, i stället för breda branschlistor. Köp en lista, testa den och köp igen.",
  },
];

export default function Audiences() {
  return (
    <section id="for-vem" className="bg-white pb-16 pt-16 sm:pb-20 sm:pt-20 lg:pb-28 lg:pt-28">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex items-center gap-3 px-5 sm:mb-8 sm:px-8 lg:px-12">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white sm:h-7 sm:w-7 sm:text-[12px]">
            3
          </span>
          <span className="rounded-full border border-gray-200 px-3 py-1 text-[12px] font-medium sm:px-4 sm:py-1.5 sm:text-[13px]">
            För vem
          </span>
        </div>
        <h2 className="mb-10 px-5 text-[clamp(1.75rem,6vw,3.6rem)] font-medium leading-[1.08] tracking-[-0.03em] text-gray-900 sm:mb-14 sm:px-8 lg:px-12">
          Byggt för dig som säljer
          <br className="hidden sm:block" /> till små företag.
        </h2>
        <div className="grid grid-cols-1 gap-5 px-5 sm:gap-6 sm:px-8 md:grid-cols-2 lg:px-12">
          {ITEMS.map((i) => (
            <div key={i.title} className="rounded-2xl bg-[#F5F5F5] p-6 sm:p-8">
              <h3 className="mb-3 text-[20px] font-semibold text-gray-900">{i.title}</h3>
              <p className="text-[14px] leading-[1.65] text-gray-600 sm:text-[15px]">{i.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 px-5 sm:px-8 lg:px-12">
          <RollButton
            label="Se exempellista"
            href="#exempel"
            className="w-fit bg-[#F26522] py-2 pl-5 pr-2 text-[13px] text-white hover:bg-[#e05a1a] sm:pl-6 sm:text-[14px]"
            circleClassName="h-7 w-7 sm:h-8 sm:w-8"
            arrowClassName="text-[#F26522]"
          />
        </div>
      </div>
    </section>
  );
}
