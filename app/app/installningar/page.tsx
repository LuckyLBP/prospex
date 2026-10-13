import Link from "next/link";
import Header from "@/components/dashboard/Header";
import CopyField from "@/components/account/CopyField";
import { Flash } from "@/components/admin/bits";
import { requireMember } from "@/lib/auth";
import { getPrefs } from "@/lib/account";
import { QUEUE_ORDERS } from "@/lib/dialer/order";
import { TEMPLATES } from "@/lib/dialer/scope";
import { ensureFeedToken } from "@/lib/workflow";
import { baseUrl } from "@/lib/url";
import { saveSettingsAction, sendTestReminderAction } from "./actions";

export const metadata = { title: "Inställningar" };

const chip = "flex h-11 cursor-pointer items-center rounded-full border border-gray-200 bg-white px-4 text-[14px] font-medium text-ink transition-colors hover:border-gray-400 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const m = await requireMember();
  const sp = await searchParams;
  const [prefs, token, base] = await Promise.all([getPrefs(m.user.id), ensureFeedToken(m.user.id), baseUrl()]);
  const https = `${base}/cal/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const card = "rounded-3xl bg-white p-6 shadow-soft";
  const h2 = "text-[16px] font-semibold text-ink";
  const hint = "mt-1 text-[13px] text-gray-500";

  return (
    <>
      <Header title="Inställningar" subtitle="Hur ringläget och påminnelserna fungerar för dig" />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid grid-cols-1 gap-5">
        <form action={saveSettingsAction} className="contents">
          <section className={card}>
            <h2 className={h2}>Ringläge</h2>
            <p className={hint}>Det här gäller din nästa nya lista i ringläget, när du öppnar det utan att ha valt något själv.</p>

            <p className="mb-2 mt-5 text-[12px] font-medium text-gray-600">Standardmall</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Standardmall">
              {TEMPLATES.map((t) => (
                <label key={t.label} title={t.hint}>
                  <input type="radio" name="template" value={t.value ?? ""} defaultChecked={(prefs.template ?? null) === t.value} className="peer sr-only" />
                  <span className={chip}>{t.label}</span>
                </label>
              ))}
            </div>

            <p className="mb-2 mt-5 text-[12px] font-medium text-gray-600">Standardordning</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Standardordning">
              {QUEUE_ORDERS.map((o) => (
                <label key={o.value}>
                  <input type="radio" name="order" value={o.value} defaultChecked={prefs.order === o.value} className="peer sr-only" />
                  <span className={chip}>{o.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>Påminnelser</h2>
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input type="checkbox" name="callback_email" defaultChecked={prefs.callbackEmail} className="mt-1 h-5 w-5 shrink-0 accent-accent" />
              <span>
                <span className="block text-[14px] font-medium text-ink">Mejla mig dagens återringningar</span>
                <span className="block text-[13px] text-gray-500">Ett mejl varje morgon runt klockan 07 med de återringningar du ska ringa den dagen. Inget mejl skickas när du inte har några.</span>
              </span>
            </label>
          </section>

          <div><button className="h-12 rounded-full bg-ink px-8 text-[15px] font-semibold text-white hover:bg-gray-800">Spara inställningar</button></div>
        </form>

        <section className={card}>
          <h2 className={h2}>Testa påminnelsen</h2>
          <p className={hint}>Skickar ett mejl till {m.user.email} med dagens återringningar, så att du ser hur det ser ut.</p>
          <form action={sendTestReminderAction} className="mt-4"><button className="h-11 rounded-full border border-gray-300 bg-white px-5 text-[14px] font-medium text-ink hover:border-gray-500">Skicka testmejl</button></form>
        </section>

        <section className={card}>
          <h2 className={h2}>Kalender</h2>
          <p className={hint}>Få dina återringningar och möten i Outlook, Apple eller Google Kalender. Länken är personlig, dela den inte.</p>
          <div className="mt-4 flex flex-col gap-3">
            <CopyField value={https} label="Kalenderlänk" />
            <div className="flex flex-wrap gap-2">
              <a href={webcal} className="inline-flex h-11 items-center rounded-full border border-gray-300 bg-white px-5 text-[14px] font-medium text-ink hover:border-gray-500">Öppna i Apple Kalender</a>
              <Link href="/app/kalender" className="inline-flex h-11 items-center rounded-full px-4 text-[14px] font-medium text-accent-text underline underline-offset-4">Se kalendern</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
