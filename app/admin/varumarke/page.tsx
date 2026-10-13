import { Building2, CalendarDays, Check, Download, Eye, Globe, LayoutGrid, Layers, Mail, MapPin, Phone, PhoneCall, ScanSearch, Search, ShieldCheck, Star, Trash2, TrendingUp, Users, Bell, Clock, Briefcase, Palette, DUO_OF } from "@/components/brand/icons";
import PageHeader from "@/components/admin/PageHeader";
import { StatusPill } from "@/components/admin/bits";
import { btnPrimary, btnSecondary, inputCls } from "@/components/admin/ui";
import { Logo, LogoMark } from "@/components/brand/Logo";
import tokens from "@/brand/tokens.cjs";
import { AA_TEXT, contrast } from "@/lib/brand/contrast";

export const metadata = { title: "Varumärke" };

const c = tokens.colors;
type Swatch = { name: string; cls: string; hex: string; use: string; on?: string };
const SWATCHES: Swatch[] = [
  { name: "ink", cls: "bg-ink", hex: c.ink, use: "Text, mörka ytor, primära knappar", on: c.surface },
  { name: "accent", cls: "bg-accent", hex: c.accent.DEFAULT, use: "Varumärkets orange: ytor och signaler. Text på den är ink.", on: c.ink },
  { name: "accent-hover", cls: "bg-accent-hover", hex: c.accent.hover, use: "Tryckt eller överfarit läge", on: c.ink },
  { name: "accent-tint", cls: "bg-accent-tint", hex: c.accent.tint, use: "Mjuk bakgrund, piller", on: c.ink },
  { name: "accent-wash", cls: "bg-accent-wash", hex: c.accent.wash, use: "Den ljusaste varma ytan", on: c.ink },
  { name: "accent-text", cls: "bg-accent-text", hex: c.accent.text, use: "Orange text på ljus bakgrund", on: c.surface },
  { name: "canvas", cls: "bg-canvas", hex: c.canvas, use: "Sidans bakgrund och mjuka ytor", on: c.ink },
  { name: "surface", cls: "bg-surface border border-line", hex: c.surface, use: "Kort", on: c.ink },
  { name: "line", cls: "bg-line", hex: c.line, use: "Linjer och kanter", on: c.ink },
  { name: "muted", cls: "bg-muted", hex: c.muted, use: "Sekundär text", on: c.surface },
  { name: "success", cls: "bg-success", hex: c.success, use: "Lyckat, aktivt", on: c.ink },
  { name: "warning", cls: "bg-warning", hex: c.warning, use: "Varning (bara som yta)", on: c.ink },
  { name: "danger", cls: "bg-danger", hex: c.danger, use: "Fel, ta bort", on: c.ink },
];

const FILES = [
  ["logo.svg", "Logotyp, ljus bakgrund"], ["logo-dark.svg", "Logotyp, mörk bakgrund"], ["logo-mono.svg", "Logotyp, en färg"], ["mark.svg", "Plattan p., mörk"], ["mark-accent.svg", "Plattan p., orange"],
  ["logo.png", "Logotyp som PNG (stor)"], ["icon-512.png", "Appikon 512"], ["icon-maskable-512.png", "Appikon, maskable"],
] as const;

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-4 text-[16px] font-semibold text-ink">{children}</h2>;
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <section className={`rounded-3xl bg-white p-6 shadow-soft ${className}`}>{children}</section>;

export default function BrandPage() {
  return (
    <>
      <PageHeader title="Varumärke" subtitle="Logotyp, färger, typografi och komponenter. Allt på sidan är byggt av samma tokens som appen, så den kan inte skilja sig från den." />

      <div className="flex flex-col gap-5">
        <Card>
          <H>Logotyp</H>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex min-h-[160px] items-center justify-center rounded-2xl bg-canvas p-8"><Logo height={96} /></div>
            <div className="flex min-h-[160px] items-center justify-center rounded-2xl bg-ink p-8"><Logo height={96} theme="dark" /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-6 rounded-2xl bg-canvas p-6">
            {[96, 64, 40, 28, 20, 16].map((s) => <div key={s} className="flex flex-col items-center gap-2"><LogoMark size={s} /><span className="text-[11px] text-gray-500">{s} px</span></div>)}
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-ink p-3"><LogoMark size={64} tone="accent" /><span className="text-[11px] text-white/60">på mörkt</span></div>
          </div>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-gray-600">Logotypen är ordmärket "prospex" i Geist SemiBold, omritat som kurvor, med en orange punkt efter: ett fullt stop och en signal som hittats. För små fyrkantiga ytor (favicon, appikon, den hopfällda menyn) finns "p." på en rundad platta, mörk på ljusa ytor och orange på mörka. Under cirka 24 px ritas bokstaven och pricken något större. Ge ordmärket fri yta lika stor som bokstaven x är hög åt alla håll.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {FILES.map(([f, label]) => (
              <a key={f} href={`/brand/${f}`} download className={btnSecondary}><Download size={14} />{label}</a>
            ))}
          </div>
        </Card>

        <Card>
          <H>Ikoner</H>
          <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-gray-600">Ikonerna är Solar av 480 Design (CC BY 4.0, credit står i sidfoten och på inloggningen). Normalt används linjestilen, 1,5 px linje. Den aktiva posten i menyn får duotone-stilen med orange andra ton. Alla ikoner hämtas från <code className="rounded bg-canvas px-1.5 py-0.5 text-[12px]">components/brand/icons.ts</code>, det enda stället som vet vilket bibliotek som används.</p>
          <div className="grid grid-cols-6 gap-3 sm:grid-cols-8 lg:grid-cols-12">
            {[Phone, PhoneCall, Mail, Search, MapPin, Building2, Users, CalendarDays, Check, Star, Globe, ScanSearch, TrendingUp, Bell, Layers, Palette, Eye, Clock, Briefcase, ShieldCheck, LayoutGrid, Trash2].map((I, n) => (
              <span key={n} className="flex h-14 items-center justify-center rounded-2xl bg-canvas text-ink"><I size={24} /></span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {[LayoutGrid, PhoneCall, Users, CalendarDays, ScanSearch, ShieldCheck].map((I, n) => {
              const D = DUO_OF.get(I);
              return D ? <span key={n} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white"><D size={24} secondaryColor="var(--accent)" secondaryOpacity={1} /></span> : null;
            })}
            <span className="self-center text-[12px] text-gray-500">Aktivt läge i menyn (duotone)</span>
          </div>
        </Card>

        <Card>
          <H>Färger</H>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SWATCHES.map((s) => (
              <li key={s.name} className="overflow-hidden rounded-2xl border border-line">
                <div className={`flex h-20 items-end p-3 ${s.cls}`} style={{ color: s.on }}><span className="text-[13px] font-semibold">{contrast(s.on ?? c.ink, s.hex).toFixed(1)}:1</span></div>
                <div className="p-3">
                  <p className="text-[13px] font-semibold text-ink">{s.name} <span className="font-normal text-gray-500">{s.hex}</span></p>
                  <p className="mt-0.5 text-[12px] text-gray-600">{s.use}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-gray-600">
            Siffran på varje ruta är kontrasten mellan ytan och texten som står på den (kravet för text är {AA_TEXT}:1). Vit text på orange klarar den inte ({contrast(c.surface, c.accent.DEFAULT).toFixed(1)}:1), därför har orange ytor ink-text. Grå skalan (gray-50 till gray-900) är varma neutraler och ersätter Tailwinds kallare grå i hela appen.
          </p>
        </Card>

        <Card>
          <H>Typografi</H>
          <div className="flex flex-col gap-4">
            <div><p className="mb-1 text-[11px] text-gray-500">Rubrik stor · Geist 500 · −3 %</p><p className="text-[clamp(2rem,5vw,3.4rem)] font-medium leading-[1.08] tracking-[-0.03em] text-ink">Ring företag som redan köper det du säljer.</p></div>
            <div><p className="mb-1 text-[11px] text-gray-500">Sidrubrik · 28 px · 600 · −2 %</p><p className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">Spaning</p></div>
            <div><p className="mb-1 text-[11px] text-gray-500">Kortrubrik · 16 px · 600</p><p className="text-[16px] font-semibold text-ink">Att ta upp i samtalet</p></div>
            <div><p className="mb-1 text-[11px] text-gray-500">Brödtext · 14 px · 400</p><p className="max-w-xl text-[14px] leading-relaxed text-gray-700">Hemtjänst för äldre i Stockholm. Företaget rekryterar tre undersköterskor och saknar en synlig bokning på webbplatsen.</p></div>
            <div><p className="mb-1 text-[11px] text-gray-500">Liten text · 12 px · 500</p><p className="text-[12px] font-medium text-gray-500">Uppdaterad för 3 minuter sedan</p></div>
            <div><p className="mb-1 text-[11px] text-gray-500">Siffror står i rad (tabular)</p><p className="tabular text-[22px] font-semibold text-ink">274 235 525 kr · 60 anställda · 4,6</p></div>
          </div>
        </Card>

        <Card>
          <H>Komponenter</H>
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <button className={btnPrimary}>Primär</button>
              <button className={btnSecondary}>Sekundär</button>
              <button className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Orange handling</button>
              <button className="inline-flex h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-[14px] font-medium text-ink hover:border-gray-400"><ScanSearch size={15} className="text-accent" />Skanna webbplats</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="green">Klar</StatusPill><StatusPill tone="orange">Läser webbplatsen</StatusPill><StatusPill tone="amber">Nära gränsen</StatusPill><StatusPill tone="red">Misslyckades</StatusPill><StatusPill tone="gray">Avstängd</StatusPill><StatusPill tone="dark">Admin</StatusPill>
            </div>
            <div className="grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
              <input className={inputCls} placeholder="Fält" readOnly />
              <input className={inputCls} defaultValue="Fält med innehåll" readOnly />
            </div>
            <div className="max-w-md rounded-3xl bg-canvas p-5">
              <p className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Hemtjänst AB</p>
              <p className="mt-1 text-[13px] text-gray-500">Stockholm · Aktivt bolag</p>
              <a className="mt-4 flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-ink px-4 text-[17px] font-semibold text-white"><Phone size={18} className="text-accent" />08-765 43 21</a>
              <div className="mt-3 rounded-2xl bg-accent-wash p-4 ring-1 ring-accent/15">
                <p className="mb-1.5 text-[13px] font-semibold text-ink">Att ta upp i samtalet</p>
                <p className="text-[14px] leading-snug text-gray-800">Rekryterar tre undersköterskor, vilket tyder på tillväxt.</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
