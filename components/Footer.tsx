import { Logo } from "@/components/brand/Logo";
import { VERIFIED } from "@/lib/mock";

export default function Footer() {
  return (
    <footer className="bg-canvas py-10">
      <div className="mx-auto max-w-[1440px] px-5 text-[12px] leading-relaxed text-gray-600 sm:px-8 lg:px-12">
        <Logo height={28} className="mb-3" />
        <p>Listorna beskriver företag och vad som syns på deras webbplatser och profiler. Data verifierat {VERIFIED}.</p>
        <p>Leverantörer nämns endast som text. Vi har ingen koppling till någon namngiven leverantör.</p>
      </div>
    </footer>
  );
}
