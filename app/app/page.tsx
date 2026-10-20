import Link from "next/link";
import { ArrowUpRight, CalendarDays, PhoneCall } from "@/components/brand/icons";
import Header from "@/components/dashboard/Header";
import SupplierLogo from "@/components/ui/SupplierLogo";
import SpaningWidget from "@/components/dashboard/SpaningWidget";
import { requireMember } from "@/lib/auth";
import { orgProfiles, sweepDeadProfiles } from "@/lib/profile/store";
import { getStatsCached, getSuppliersCached } from "@/lib/cached";
import { homeStats, myCallStats, upcomingEvents } from "@/lib/workflow";
import { kindMeta } from "@/lib/status";
import { formatDateTime } from "@/lib/time";

const sv = (n: number) => n.toLocaleString("sv-SE");

export default async function StartPage() {
  const m = await requireMember();
  const [me, week, events, cat, suppliers] = await Promise.all([
    homeStats(m.org.id, m.user.id), myCallStats(m.org.id, m.user.id), upcomingEvents(m.user.id, 5), getStatsCached(), getSuppliersCached(),
  ]);
  // Spaning visas bara för bolag som en admin öppnat den för.
  const hasSpaning = m.profileAccess;
  if (hasSpaning) await sweepDeadProfiles();
  const recentSpaningar = hasSpaning ? await orgProfiles(m.org.id, 4).catch(() => []) : [];
  const date = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const top = suppliers.slice(0, 6);
  const max = top[0]?.n ?? 1;
  const peak = Math.max(1, ...week.week.map((d) => d.count));

  const banner =
    me.callbacks_overdue > 0
      ? `Du har ${me.callbacks_overdue} återringning${me.callbacks_overdue === 1 ? "" : "ar"} som har förfallit. De ligger först i ringkön.`
      : me.callbacks_today > 0
        ? `Du har ${me.callbacks_today} återringning${me.callbacks_today === 1 ? "" : "ar"} planerade idag.`
        : "Inga återringningar planerade idag.";

  const stats = [
    { value: sv(me.calls_today), label: `Dina samtal idag · bolaget ${sv(me.team_calls_today)}` },
    { value: sv(me.meetings), label: "Möten bokade, kommande 30 dagar" },
    { value: sv(me.contacts), label: "Dina kontakter" },
    { value: sv(me.callbacks_overdue), label: "Förfallna återringningar" },
  ];

  return (
    <>
      <Header title={`Hej, ${m.user.name}`} subtitle={`${date.charAt(0).toUpperCase() + date.slice(1)} · ${m.org.name}`} />

      <div className="mb-5 rounded-full bg-ink px-6 py-4 text-[15px] text-white">{banner}</div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className="rounded-3xl bg-white p-6">
            <p className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">{x.value}</p>
            <p className="mt-3 text-[13px] text-gray-500">{x.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <div className="rounded-3xl bg-white p-6">
            <h2 className="mb-5 text-[18px] font-semibold text-ink">Dina samtal, senaste veckan</h2>
            <div className="flex h-32 items-end gap-3">
              {week.week.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[12px] text-gray-500">{d.count}</span>
                  <div className={`w-full rounded-lg ${d.isToday ? "bg-accent" : "bg-ink"}`} style={{ height: `${Math.max(4, (d.count / peak) * 80)}px` }} />
                  <span className={`text-[12px] ${d.isToday ? "font-semibold text-accent-text" : "text-gray-500"}`}>{d.weekday}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-ink">Kommande</h2>
              <Link href="/app/kalender" className="text-[13px] font-medium underline underline-offset-4">Se kalendern</Link>
            </div>
            {events.length === 0 ? (
              <p className="text-[14px] text-gray-500">Inget inplanerat. Boka återringningar och möten i ringläget så dyker de upp här.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${kindMeta(e.kind).block.split(" ")[0]}`} />
                      {e.company_id ? <Link href={`/app/foretag/${e.company_id}`} className="truncate font-medium hover:underline">{e.title}</Link> : <span className="truncate font-medium">{e.title}</span>}
                    </span>
                    <span className="shrink-0 text-gray-500">{formatDateTime(e.starts_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-ink">Största leverantörerna</h2>
              <Link href="/app/leverantorer" className="text-[13px] font-medium underline underline-offset-4">Se alla</Link>
            </div>
            <div className="flex flex-col gap-4">
              {top.map((x) => (
                <Link key={x.slug} href={`/app/leverantorer/${x.slug}`} className="group block">
                  <div className="mb-1.5 flex justify-between text-[14px]">
                    <span className="flex items-center gap-2.5 font-medium text-ink group-hover:underline"><SupplierLogo name={x.name} logo={x.logo} size={24} />{x.name}</span>
                    <span className="text-gray-500">{sv(x.n)} företag</span>
                  </div>
                  <div className="h-2 rounded-full bg-canvas">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, (x.n / max) * 100)}%` }} />
                  </div>
                </Link>
              ))}
            </div>
            <p className="mt-6 text-[12px] text-gray-500">
              Databasen: {sv(cat.companies)} företag, {sv(cat.signals)} signaler. Leverantörer visas som text. Vi har ingen koppling till någon av dem.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Link href="/app/ring" className="group flex min-h-[200px] items-center gap-4 rounded-3xl bg-ink p-6 text-white">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent"><PhoneCall size={26} /></span>
            <span className="flex-1">
              <span className="block text-[12px] text-white/60">Ringläge</span>
              <span className="block text-[18px] font-semibold leading-snug">Börja ringa</span>
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink transition-transform group-hover:rotate-45"><ArrowUpRight size={18} /></span>
          </Link>

          {hasSpaning && <SpaningWidget recent={recentSpaningar} />}

          <div className="rounded-3xl bg-white p-6">
            <h2 className="mb-2 flex items-center gap-2 text-[18px] font-semibold text-ink"><CalendarDays size={18} /> Synka kalendern</h2>
            <p className="mb-4 text-[13px] text-gray-600">Få återringningar och möten i Outlook, Apple och Google Kalender.</p>
            <Link href="/app/kalender" className="inline-block rounded-full border border-gray-300 px-4 py-2 text-[13px] font-medium hover:border-gray-500">Hämta kalenderlänk</Link>
          </div>
        </div>
      </div>
    </>
  );
}
