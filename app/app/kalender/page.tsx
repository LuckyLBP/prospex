import Link from "next/link";
import { headers } from "next/headers";
import { ChevronLeft, ChevronRight, Download, Trash2 } from "lucide-react";
import Header from "@/components/dashboard/Header";
import CopyButton from "@/components/dashboard/CopyButton";
import { requireMember } from "@/lib/auth";
import { ensureFeedToken, eventsBetween } from "@/lib/workflow";
import { KINDS, kindMeta } from "@/lib/status";
import { addDays, dateKey, formatDateTime, hourMinute, mondayOf, startOfDayUtc, toLocalInput } from "@/lib/time";
import { createEvent, deleteEvent, rotateFeed } from "./actions";

const FIRST_H = 6;
const LAST_H = 22;
const HOUR_PX = 48;
const DAYS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const user = (await requireMember()).user;
  const sp = await searchParams;
  const today = dateKey(new Date());
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.w ?? "") ? sp.w! : today;
  const monday = mondayOf(anchor);
  const keys = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const [events, token] = await Promise.all([
    eventsBetween(user.id, startOfDayUtc(monday), startOfDayUtc(addDays(monday, 7))),
    ensureFeedToken(user.id),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const https = `${local ? "http" : "https"}://${host}/cal/${token}.ics`;
  const webcal = `webcal://${host}/cal/${token}.ics`;

  const weekLabel = `${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${monday}T12:00:00Z`))} - ${new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${keys[6]}T12:00:00Z`))}`;
  const hours = Array.from({ length: LAST_H - FIRST_H }, (_, i) => FIRST_H + i);
  const nav = "flex h-9 w-9 items-center justify-center rounded-full bg-white hover:bg-gray-100";
  const input = "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-accent";

  return (
    <>
      <Header title="Kalender" subtitle={weekLabel} />

      <div className="mb-4 flex items-center gap-2">
        <Link href={`/app/kalender?w=${addDays(monday, -7)}`} className={nav} aria-label="Föregående vecka"><ChevronLeft size={18} /></Link>
        <Link href="/app/kalender" className="rounded-full bg-white px-4 py-2 text-[13px] font-medium hover:bg-gray-100">Idag</Link>
        <Link href={`/app/kalender?w=${addDays(monday, 7)}`} className={nav} aria-label="Nästa vecka"><ChevronRight size={18} /></Link>
      </div>

      <div className="mb-5 overflow-x-auto rounded-3xl bg-white p-4">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-gray-100 pb-2 text-center text-[12px] text-gray-500">
            <span />
            {keys.map((k, i) => (
              <span key={k} className={k === today ? "font-semibold text-accent-text" : ""}>{DAYS[i]} {Number(k.slice(8))}</span>
            ))}
          </div>
          <div className="relative grid grid-cols-[48px_repeat(7,1fr)]" style={{ height: hours.length * HOUR_PX }}>
            <div>
              {hours.map((hr) => (
                <div key={hr} style={{ height: HOUR_PX }} className="pr-2 text-right text-[11px] text-gray-400">{String(hr).padStart(2, "0")}</div>
              ))}
            </div>
            {keys.map((k) => (
              <div key={k} className={`relative border-l border-gray-100 ${k === today ? "bg-accent-wash" : ""}`}>
                {hours.map((hr) => <div key={hr} style={{ height: HOUR_PX }} className="border-b border-gray-50" />)}
                {events.filter((e) => dateKey(e.starts_at) === k).map((e) => {
                  const { h: hh, m } = hourMinute(e.starts_at);
                  const startMin = Math.max(FIRST_H * 60, hh * 60 + m);
                  const dur = Math.max(20, (e.ends_at.getTime() - e.starts_at.getTime()) / 60000);
                  const top = ((startMin - FIRST_H * 60) / 60) * HOUR_PX;
                  const height = Math.min((dur / 60) * HOUR_PX, hours.length * HOUR_PX - top);
                  const cls = `absolute inset-x-0.5 overflow-hidden rounded-lg px-2 py-1 text-[11px] leading-tight ${kindMeta(e.kind).block}`;
                  const body = <><span className="font-semibold">{String(hh).padStart(2, "0")}:{String(m).padStart(2, "0")}</span> {e.title}</>;
                  return e.company_id ? (
                    <Link key={e.id} href={`/app/foretag/${e.company_id}`} style={{ top, height }} className={cls}>{body}</Link>
                  ) : (
                    <div key={e.id} style={{ top, height }} className={cls}>{body}</div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-3xl bg-white p-6">
          <h2 className="mb-4 text-[18px] font-semibold text-ink">Ny händelse</h2>
          <form action={createEvent} className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-[12px] font-medium text-gray-500">Titel<input name="title" required className={input} /></label>
            <label className="text-[12px] font-medium text-gray-500">Typ
              <select name="kind" defaultValue="mote" className={input}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
            </label>
            <label className="text-[12px] font-medium text-gray-500">Längd (min)<input name="minutes" type="number" min={5} defaultValue={30} className={input} /></label>
            <label className="col-span-2 text-[12px] font-medium text-gray-500">Start
              <input name="start" type="datetime-local" required defaultValue={toLocalInput(new Date(Date.now() + 3600_000)).slice(0, 14) + "00"} className={input} />
            </label>
            <button className="col-span-2 rounded-full bg-ink px-6 py-3 text-[14px] font-semibold text-white">Lägg till</button>
          </form>

          <h3 className="mb-2 mt-6 text-[14px] font-semibold text-ink">Den här veckan</h3>
          {events.length === 0 ? (
            <p className="text-[13px] text-gray-500">Inga händelser.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${kindMeta(e.kind).block.split(" ")[0]}`} />
                    <span className="truncate text-gray-800">{e.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-gray-500">
                    {formatDateTime(e.starts_at)}
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={e.id} />
                      <button aria-label="Ta bort" className="text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl bg-white p-6">
          <h2 className="mb-1 text-[18px] font-semibold text-ink">Synka med din kalender</h2>
          <p className="mb-4 text-[13px] text-gray-600">Prenumerera på länken nedan i Apple, Outlook eller Google. Händelser från Prospex dyker upp i din kalender.</p>
          <div className="mb-3 break-all rounded-xl bg-canvas px-4 py-3 font-mono text-[12px] text-gray-800">{https}</div>
          <div className="mb-5 flex flex-wrap gap-2">
            <CopyButton text={https} />
            <a href={webcal} className="rounded-full border border-gray-300 px-4 py-2 text-[13px] font-medium hover:border-gray-500">Öppna i Apple Kalender</a>
            <a href={https} download="prospex.ics" className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-[13px] font-medium hover:border-gray-500"><Download size={14} /> Ladda ner .ics</a>
          </div>
          <ul className="flex flex-col gap-2 text-[13px] text-gray-700">
            <li><span className="font-semibold">Apple:</span> klicka på knappen ovan, eller Arkiv, Ny kalenderprenumeration.</li>
            <li><span className="font-semibold">Outlook:</span> Lägg till kalender, Prenumerera från webben, klistra in länken.</li>
            <li><span className="font-semibold">Google:</span> Andra kalendrar, Från webbadress, klistra in länken. Google uppdaterar var 8:e till 24:e timme.</li>
          </ul>
          {local && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
              Du kör lokalt. Kalenderprogrammen når bara länken när Prospex är publicerat på en öppen adress. Under tiden kan du ladda ner filen.
            </p>
          )}
          <form action={rotateFeed} className="mt-4">
            <button className="text-[12px] text-gray-500 underline underline-offset-4 hover:text-gray-800">Skapa ny länk (den gamla slutar fungera)</button>
          </form>
        </div>
      </div>
    </>
  );
}
