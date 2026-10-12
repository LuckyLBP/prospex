"use client";

import { useState } from "react";
import Select from "@/components/ui/Select";
import { Checkbox, Field, FormSection, Input, Textarea } from "./FormSection";
import { METHODS, METHOD_INFO, collectionDefaults, type Method } from "@/lib/sources/collection";
import { FREE_MONTHLY_REQUESTS, parsePlacesConfig } from "@/lib/lists-config";
import { SCRIPTS, SCRIPT_KEYS } from "@/lib/scrapers/scripts/manifest";
import { VIEWDNS_ENDPOINT_LABELS, VIEWDNS_ENDPOINTS } from "@/lib/sources/schema";

const sv = (n: number) => n.toLocaleString("sv-SE");

/** Avsnittet Insamling: välj metod, och fälten byts efter metoden. Allt skickas med som vanliga formulärfält. */
export default function CollectionFields({ method: m0, config, enrichSites }: { method: string | null; config: unknown; enrichSites: boolean }) {
  const d = collectionDefaults(m0, config);
  const [method, setMethod] = useState<Method | "">(d.method);
  const [gp, setGp] = useState({ q: d.gp_queries, l: d.gp_locations, p: d.gp_pages });
  const cost = parsePlacesConfig({ queries: gp.q, locations: gp.l, maxPages: gp.p });

  return (
    <FormSection title="Insamling" description="Hur företagen hittas. Körs automatiskt när källan är publicerad (varje vecka, Google Places varje månad), eller med Kör nu.">
      <Field label="Metod" hint={method ? METHOD_INFO[method].hint : "Utan metod samlas inget in."}>
        <Select name="method" value={method} onChange={(v) => setMethod(v as Method | "")} ariaLabel="Insamlingsmetod" className="!h-[42px] !rounded-xl"
          options={[{ value: "", label: "Ingen insamling" }, ...METHODS.map((k) => ({ value: k, label: METHOD_INFO[k].label }))]} />
      </Field>

      {method === "publicwww" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Sökfråga" hint="Samma syntax som på publicwww.com, till exempel &quot;hello-swapi&quot;."><Input name="pww_query" required defaultValue={d.pww_query} /></Field>
          <Field label="Högst antal träffar" hint="1 till 5 000."><Input name="pww_max" type="number" min={1} max={5000} defaultValue={d.pww_max} /></Field>
        </div>
      )}

      {method === "viewdns" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.2fr_1fr_120px]">
          <Field label="Uppslag"><ViewdnsEndpoint defaultValue={d.vd_endpoint} /></Field>
          <Field label="Mål" hint="IP-adress, namnserver eller sökterm."><Input name="vd_target" required defaultValue={d.vd_target} /></Field>
          <Field label="Sidor" hint="1 till 5."><Input name="vd_pages" type="number" min={1} max={5} defaultValue={d.vd_pages} /></Field>
        </div>
      )}

      {method === "googleplaces" && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Söktermer" hint="En per rad, högst 10."><Textarea name="gp_queries" rows={4} defaultValue={d.gp_queries} onChange={(e) => setGp((s) => ({ ...s, q: e.target.value }))} placeholder={"frisör\nfrisörsalong"} /></Field>
            <Field label="Orter" hint="En per rad, högst 60."><Textarea name="gp_locations" rows={4} defaultValue={d.gp_locations} onChange={(e) => setGp((s) => ({ ...s, l: e.target.value }))} placeholder={"Stockholm\nGöteborg"} /></Field>
          </div>
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
            <Field label="Sidor per sökning" hint="1 till 3, 20 företag per sida."><Input name="gp_pages" type="number" min={1} max={3} defaultValue={d.gp_pages} onChange={(e) => setGp((s) => ({ ...s, p: Number(e.target.value) }))} /></Field>
            <p className="pb-6 text-[13px] text-gray-500">{cost.ok ? <>Cirka <span className="font-semibold text-ink">{sv(cost.requests)}</span> anrop per körning, av {sv(FREE_MONTHLY_REQUESTS)} gratis i månaden.</> : cost.error}</p>
          </div>
        </>
      )}

      {method === "agency" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_160px]">
            <Field label="Byråns namn" hint="Som det står i sidfoten, till exempel Conseo."><Input name="ag_name" required defaultValue={d.ag_name} /></Field>
            <Field label="Byråns domän" hint="Till exempel conseo.se."><Input name="ag_domain" required defaultValue={d.ag_domain} /></Field>
            <Field label="Högst antal kandidater" hint="10 till 3 000. Högst 600 nya kontrolleras per körning."><Input name="ag_max" type="number" min={10} max={3000} defaultValue={d.ag_max} /></Field>
          </div>
          <Checkbox name="ag_viewdns" defaultChecked={d.ag_viewdns} label="Använd ViewDNS när byrån har egen server eller egna namnservrar" />
          <Checkbox name="ag_claude" defaultChecked={d.ag_claude} label="Låt Claude leta på byråns kund- och referenssidor och på webben (kostar några kronor per körning)" />
        </>
      )}

      {method === "domainlist" && (
        <Field label="Domäner" hint="En per rad. Även komma eller semikolon fungerar."><Textarea name="dl_domains" rows={8} required defaultValue={d.dl_domains} className="font-mono text-[13px]" /></Field>
      )}

      {method === "script" && (
        <Field label="Skript" hint={SCRIPTS[(d.script_key as keyof typeof SCRIPTS) in SCRIPTS ? (d.script_key as keyof typeof SCRIPTS) : "example"].description}>
          <ScriptSelect defaultValue={d.script_key} />
        </Field>
      )}

      {method && <Checkbox name="enrich_sites" defaultChecked={enrichSites} label="Besök webbplatserna efteråt för e-post, telefon, org.nr och en bedömning av sajten" />}
    </FormSection>
  );
}

function ViewdnsEndpoint({ defaultValue }: { defaultValue: string }) {
  const [v, setV] = useState(defaultValue);
  return <Select name="vd_endpoint" value={v} onChange={setV} ariaLabel="Uppslag" className="!h-[42px] !rounded-xl" options={VIEWDNS_ENDPOINTS.map((e) => ({ value: e, label: VIEWDNS_ENDPOINT_LABELS[e].label }))} />;
}

function ScriptSelect({ defaultValue }: { defaultValue: string }) {
  const [v, setV] = useState(defaultValue);
  return <Select name="script_key" value={v} onChange={setV} ariaLabel="Skript" className="!h-[42px] !rounded-xl" options={SCRIPT_KEYS.map((k) => ({ value: k, label: SCRIPTS[k].label }))} />;
}
