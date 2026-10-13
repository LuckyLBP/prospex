import { Logo } from "@/components/brand/Logo";
import { VERIFIED } from "@/lib/mock";

export default function Footer() {
  return (
    <footer className="bg-canvas py-10">
      <div className="mx-auto max-w-[1440px] px-5 text-[12px] leading-relaxed text-gray-600 sm:px-8 lg:px-12">
        <Logo height={44} className="mb-2 -ml-1" />
        <p>Listorna beskriver företag och vad som syns på deras webbplatser och profiler. Data verifierat {VERIFIED}.</p>
        <p>Leverantörer nämns endast som text. Vi har ingen koppling till någon namngiven leverantör.</p>
        <p className="mt-3 text-[11px] text-gray-500">Ikoner: <a href="https://www.figma.com/community/file/1166831539721848736" target="_blank" rel="noreferrer" className="underline underline-offset-4">Solar</a> av 480 Design, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline underline-offset-4">CC BY 4.0</a>.</p>
      </div>
    </footer>
  );
}
