import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Stats, { type Stat } from "@/components/landing/Stats";
import Steps from "@/components/landing/Steps";
import Features from "@/components/landing/Features";
import AccessForm from "@/components/landing/AccessForm";
import Footer from "@/components/landing/Footer";
import { getUserOrNull } from "@/lib/auth";
import { getStatsCached } from "@/lib/cached";

const sv = (n: number) => n.toLocaleString("sv-SE");
const floorTo = (n: number, step: number) => Math.floor(n / step) * step;

/** Siffrorna på sidan, räknade ur katalogen. Utan databas visas inga siffror alls. */
async function facts() {
  try {
    const s = await getStatsCached();
    const verified = s.last_seen ? new Date(s.last_seen).toLocaleDateString("sv-SE", { month: "long", year: "numeric" }) : null;
    const companies = floorTo(s.companies, 1000);
    const signals = floorTo(s.signals, 1000);
    const sources = s.suppliers + s.lists;
    const stats: Stat[] = [
      ...(companies >= 1000 ? [{ value: `${sv(companies)}+`, label: "företag i katalogen" }] : []),
      ...(signals >= 1000 ? [{ value: `${sv(signals)}+`, label: "signaler med källa" }] : []),
      ...(sources > 0 ? [{ value: sv(sources), label: "leverantörer och listor" }] : []),
    ];
    return { pill: companies >= 1000 ? `${sv(companies)}+ företag${verified ? `, verifierat ${verified}` : ""}` : null, verified, stats: stats.length === 3 ? stats : [] };
  } catch {
    return { pill: null, verified: null, stats: [] as Stat[] };
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ atkomst?: string; wait?: string }> }) {
  const [sp, { pill, verified, stats }, user] = await Promise.all([searchParams, facts(), getUserOrNull().catch(() => null)]);
  const signedIn = !!user;
  return (
    <main className="min-h-screen bg-ink p-3 sm:p-4">
      <div className="rounded-[28px] bg-canvas">
        <Nav signedIn={signedIn} />
        <Hero pill={pill} signedIn={signedIn} />
        <Stats items={stats} />
        <Steps />
        <Features />
      </div>
      <AccessForm status={sp.atkomst} wait={sp.wait} />
      <Footer verified={verified} signedIn={signedIn} />
    </main>
  );
}
