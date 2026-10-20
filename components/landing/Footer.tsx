import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function Footer({ verified }: { verified: string | null }) {
  return (
    <footer className="mx-auto max-w-[1200px] px-5 pb-10 pt-6 text-[12px] leading-relaxed text-white/50 sm:px-8 lg:px-12">
      <div className="flex items-center justify-between">
        <Logo height={44} theme="dark" className="-ml-1" />
        <Link href="/login" className="text-[13px] text-white/70 underline underline-offset-4 hover:text-white">Logga in</Link>
      </div>
      <p className="mt-3">Listorna beskriver företag och vad som syns på deras webbplatser och profiler.{verified ? ` Data verifierat ${verified}.` : ""}</p>
      <p>Leverantörer nämns endast som text. Vi har ingen koppling till någon namngiven leverantör.</p>
      <p className="mt-3 text-[11px] text-white/40">Ikoner: <a href="https://www.figma.com/community/file/1166831539721848736" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-white/70">Solar</a> av 480 Design, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-white/70">CC BY 4.0</a>.</p>
    </footer>
  );
}
