"use client";

import { useEffect, useState } from "react";
import { Building2, Check, TriangleAlert, X } from "lucide-react";
import { companyStatus, type AnnualFigures, type CompanyRegistry } from "@/lib/bolagsverket/types";
import type { RegistryResponse } from "@/lib/bolagsverket/response";

const date = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeZone: "Europe/Stockholm" }).format(new Date(d)) : "–");
const kr = (n: number | null) => (n === null ? "–" : `${new Intl.NumberFormat("sv-SE").format(Math.round(n))} kr`);

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-1.5 text-[14px]">
      <dt className="text-gray-500">{k}</dt>
      <dd className="min-w-0 text-gray-900">{children}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-canvas p-4">
      <h3 className="mb-1.5 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Status({ org }: { org: CompanyRegistry }) {
  const s = companyStatus(org);
  const base = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium";
  if (s.kind === "active") return <span className={`${base} bg-emerald-100 text-emerald-800`}><Check size={13} />Aktivt bolag</span>;
  if (s.kind === "deregistered") return <span className={`${base} bg-rose-100 text-rose-800`}><TriangleAlert size={13} />Avregistrerat {date(s.date)}{s.reason ? `, ${s.reason.toLowerCase()}` : ""}</span>;
  if (s.kind === "proceeding") return <span className={`${base} bg-amber-100 text-amber-800`}><TriangleAlert size={13} />{s.label}{s.from ? ` sedan ${date(s.from)}` : ""}</span>;
  if (s.kind === "inactive") return <span className={`${base} bg-gray-200 text-gray-700`}>Ej verksamt</span>;
  return <span className={`${base} bg-gray-100 text-gray-600`}>Status okänd</span>;
}

function Figures({ f }: { f: AnnualFigures }) {
  const rows: [string, string][] = [
    ["Omsättning", kr(f.revenue)],
    ["Årets resultat", kr(f.profit)],
    ["Eget kapital", kr(f.equity)],
    ["Summa tillgångar", kr(f.totalAssets)],
    ["Soliditet", f.solidity === null ? "–" : `${f.solidity.toString().replace(".", ",")} %`],
    ["Anställda", f.employees === null ? "–" : String(Math.round(f.employees))],
  ];
  return (
    <Block title={`Årsredovisning, räkenskapsår som slutade ${date(f.periodEnd)}`}>
      <dl>{rows.map(([k, v]) => <Row key={k} k={k}>{v}</Row>)}</dl>
      {f.registeredAt && <p className="mt-1 text-[12px] text-gray-500">Inlämnad {date(f.registeredAt)}</p>}
    </Block>
  );
}

type Props = {
  companyId: string;
  name: string | null;
  onClose: () => void;
  /** Efter att ett org.nr satts: ladda om kortet. */
  onOrgnrSaved: () => void;
};

/**
 * Företagsuppgifter från Bolagsverket (och SCB) för ett företag. Öppnas från kortet; hämtar färska
 * uppgifter via /api/companies/[id]/registry, som själv cachar i en vecka. Saknas organisationsnumret
 * kan det anges här, och kontrolleras mot Bolagsverket innan det sparas.
 */
export default function RegistryDialog({ companyId, name, onClose, onOrgnrSaved }: Props) {
  const [res, setRes] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgnr, setOrgnr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/companies/${companyId}/registry`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: RegistryResponse) => alive && setRes(d))
      .catch(() => alive && setRes({ status: "error", message: "Kunde inte hämta uppgifterna. Kontrollera uppkopplingen.", temporary: true }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [companyId]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/companies/${companyId}/registry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgnr }) });
      const d = (await r.json()) as RegistryResponse;
      setRes(d);
      if (d.status === "ok") onOrgnrSaved();
    } catch {
      setRes({ status: "error", message: "Kunde inte spara numret.", temporary: true });
    } finally {
      setSaving(false);
    }
  };

  const org = res?.status === "ok" ? res.organisation : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Företagsuppgifter"
        onClick={(e) => e.stopPropagation()}
        className="dialer-toast flex max-h-[min(88vh,820px)] w-full max-w-[600px] flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <p className="mb-0.5 flex items-center gap-1.5 text-[12px] font-medium text-gray-500"><Building2 size={14} />Företagsuppgifter</p>
            <h2 className="truncate text-[20px] font-semibold tracking-[-0.01em] text-ink">{org?.name ?? name ?? "Okänt företag"}</h2>
            {org && <div className="mt-2"><Status org={org} /></div>}
          </div>
          <button onClick={onClose} aria-label="Stäng" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="space-y-3" aria-busy="true" aria-label="Hämtar från Bolagsverket">
              {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-canvas" />)}
              <p className="text-center text-[12px] text-gray-500">Hämtar från Bolagsverket</p>
            </div>
          )}

          {!loading && res?.status === "no_orgnr" && (
            <div>
              <p className="text-[14px] leading-relaxed text-gray-700">Vi har inget organisationsnummer för det här företaget. Ange det så hämtar vi uppgifterna från Bolagsverket.</p>
              <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-4 flex gap-2">
                <input
                  value={orgnr}
                  onChange={(e) => setOrgnr(e.target.value)}
                  placeholder="556677-8899"
                  inputMode="numeric"
                  autoFocus
                  aria-label="Organisationsnummer"
                  className="h-10 flex-1 rounded-full border border-gray-200 px-4 text-[14px] outline-none focus:border-accent"
                />
                <button disabled={saving || orgnr.replace(/\D/g, "").length < 10} className="h-10 rounded-full bg-ink px-5 text-[13px] font-semibold text-white disabled:opacity-40">
                  {saving ? "Kontrollerar" : "Hämta uppgifter"}
                </button>
              </form>
            </div>
          )}

          {!loading && res?.status === "error" && (
            <div className="rounded-2xl bg-rose-50 p-4 text-[14px] text-rose-900">
              <p className="font-medium">{res.message}</p>
              {res.temporary && <p className="mt-1 text-[13px] text-rose-800">Det är ett tillfälligt fel. Försök igen om en stund.</p>}
              {orgnr !== "" || res.message.includes("organisationsnummer") ? (
                <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-3 flex gap-2">
                  <input value={orgnr} onChange={(e) => setOrgnr(e.target.value)} placeholder="556677-8899" aria-label="Organisationsnummer" className="h-10 flex-1 rounded-full border border-rose-200 bg-white px-4 text-[14px] outline-none" />
                  <button disabled={saving} className="h-10 rounded-full bg-ink px-5 text-[13px] font-semibold text-white disabled:opacity-40">Försök igen</button>
                </form>
              ) : null}
            </div>
          )}

          {!loading && res?.status === "ok" && !org && (
            <div className="rounded-2xl bg-amber-50 p-4 text-[14px] text-amber-900">
              <p className="font-medium">Bolagsverket känner inte till organisationsnumret {res.orgnr}.</p>
              <p className="mt-1 text-[13px]">Det kan vara en enskild firma, en förening eller ett nummer som är fel i våra uppgifter.</p>
            </div>
          )}

          {!loading && res?.status === "ok" && org && (
            <div className="flex flex-col gap-3">
              <Block title="Uppgifter">
                <dl>
                  <Row k="Org.nr">{org.orgnr.length === 10 ? `${org.orgnr.slice(0, 6)}-${org.orgnr.slice(6)}` : org.orgnr}</Row>
                  <Row k="Bolagsform">{org.legalForm?.label ?? "–"}</Row>
                  <Row k="Registrerat">{date(org.registeredAt)}</Row>
                  {org.otherNames.length > 0 && <Row k="Andra namn">{org.otherNames.join(", ")}</Row>}
                  {org.address && (
                    <Row k="Adress">
                      {org.address.co && <>c/o {org.address.co}<br /></>}
                      {org.address.street && <>{org.address.street}<br /></>}
                      {org.address.postalCode} {org.address.city}
                    </Row>
                  )}
                  {org.advertisingBlocked !== null && <Row k="Reklamspärr">{org.advertisingBlocked ? <span className="font-medium text-amber-700">Ja, företaget har spärrat adresserad reklam</span> : "Nej"}</Row>}
                </dl>
              </Block>

              {org.proceedings.length > 0 && (
                <Block title="Pågående förfaranden">
                  <ul className="flex flex-col gap-1 text-[14px] text-amber-800">
                    {org.proceedings.map((p) => <li key={p.label + p.from} className="flex items-center gap-2"><TriangleAlert size={14} />{p.label}{p.from ? `, sedan ${date(p.from)}` : ""}</li>)}
                  </ul>
                </Block>
              )}

              {org.sni.length > 0 && (
                <Block title="Bransch">
                  <ul className="flex flex-col gap-1 text-[14px] text-gray-800">
                    {org.sni.map((s) => <li key={s.code}><span className="mr-2 font-mono text-[12px] text-gray-500">{s.code}</span>{s.label}</li>)}
                  </ul>
                </Block>
              )}

              {org.description && (
                <Block title="Verksamhet"><p className="whitespace-pre-line text-[14px] leading-relaxed text-gray-700">{org.description}</p></Block>
              )}

              {res.annualReport ? (
                <Figures f={res.annualReport} />
              ) : (
                <Block title="Årsredovisning"><p className="text-[14px] text-gray-500">Ingen digitalt inlämnad årsredovisning hos Bolagsverket. Företag som lämnat in på papper syns inte här.</p></Block>
              )}

              {org.unavailable.length > 0 && <p className="text-[12px] text-amber-700">Kunde inte hämta just nu: {org.unavailable.join(", ")}.</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-3 text-[12px] text-gray-500">
          <span>Källa: Bolagsverket och SCB{res?.status === "ok" ? `, hämtat ${date(res.fetchedAt)}` : ""}.{res?.status === "ok" && res.test ? " Testmiljö." : ""}</span>
        </div>
      </div>
    </div>
  );
}
