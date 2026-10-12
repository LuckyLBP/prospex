import SupplierLogo from "@/components/ui/SupplierLogo";
import FormSelect from "@/components/ui/FormSelect";
import { Checkbox, Field, FormSection, Input, Textarea } from "./FormSection";
import CollectionFields from "./CollectionFields";
import type { AdminSource } from "@/lib/lists-admin";

type Cat = { id: string; name: string };

/**
 * Formuläret för en källa, uppdelat i avsnitt. Samma komponent används för att skapa en lista (utan `source`)
 * och för att redigera en leverantör eller lista. Spara-knappen ligger i sidhuvudet och pekar hit via `id`.
 */
export default function SourceForm({ formId, action, source, categories, kind, returnTo }: {
  formId: string; action: (f: FormData) => Promise<void>; source?: AdminSource; categories: Cat[]; kind: "supplier" | "list"; returnTo: string;
}) {
  const catOptions = [{ value: "", label: "Ingen kategori" }, ...categories.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <form id={formId} action={action} className="flex flex-col gap-5">
      {source && <input type="hidden" name="id" value={source.id} />}
      <input type="hidden" name="return_to" value={returnTo} />
      {!source && <input type="hidden" name="kind" value="list" />}

      <FormSection title="Allmänt" description={source ? `Adressen ${source.slug} ändras inte, så att länkar fortsätter fungera.` : "Namnet blir listans adress."}>
        <Field label="Namn"><Input name="name" required defaultValue={source?.name} placeholder="Frisörer" /></Field>
        <Field label="Beskrivning" hint="Visas för kunderna."><Input name="description" defaultValue={source?.description ?? ""} placeholder="Frisörsalonger i Sveriges 25 största orter." /></Field>
        {source ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Typ"><FormSelect name="kind" ariaLabel="Typ" defaultValue={source.kind} options={[{ value: "supplier", label: "Leverantör" }, { value: "list", label: "Lista" }]} className="!h-[42px] !rounded-xl" /></Field>
            <Field label="Kategori" hint="Bara för listor."><FormSelect name="category_id" ariaLabel="Kategori" defaultValue={source.category_id ?? ""} options={catOptions} className="!h-[42px] !rounded-xl" /></Field>
          </div>
        ) : (
          <Field label="Kategori"><FormSelect name="category_id" ariaLabel="Kategori" defaultValue={categories[0]?.id ?? ""} options={catOptions.slice(1)} className="!h-[42px] !rounded-xl" /></Field>
        )}
      </FormSection>

      <FormSection title="Logotyp" description="PNG, JPG, WebP eller GIF, högst 1 MB. Visas i listor, ringläget och på kortet.">
        <div className="flex items-center gap-4">
          {source && <SupplierLogo name={source.name} logo={source.logo_path} size={40} className="!h-16 !w-16 !rounded-2xl !text-[18px]" />}
          <div className="flex-1">
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-[#F4F4F1] file:px-4 file:py-2 file:text-[13px] file:font-medium" />
            {source?.logo_path && <div className="mt-2"><Checkbox name="remove_logo" label="Ta bort nuvarande logotyp" /></div>}
          </div>
        </div>
      </FormSection>

      <CollectionFields method={source?.method ?? null} config={source?.config} enrichSites={source?.enrich_sites ?? true} />

      <FormSection title="Publicering" description="Opublicerade källor syns inte för kunderna. En lista utan företag visas inte heller.">
        <Checkbox name="published" defaultChecked={source?.published ?? false} label="Publicerad (syns för kunderna)" />
        <div className="max-w-[160px]"><Field label="Sortering" hint="Lägst först."><Input name="sort" type="number" defaultValue={source?.sort ?? 0} /></Field></div>
      </FormSection>
    </form>
  );
}
