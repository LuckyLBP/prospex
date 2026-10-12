import FormSelect from "@/components/ui/FormSelect";
import { Checkbox, Field, FormSection, Input } from "./FormSection";
import { ICON_NAMES } from "@/lib/lists-admin";

type Cat = { id: string; slug: string; name: string; description: string | null; icon: string | null; names_brand: boolean; sort: number };

export default function CategoryForm({ formId, action, category }: { formId: string; action: (f: FormData) => Promise<void>; category?: Cat }) {
  return (
    <form id={formId} action={action} className="flex flex-col gap-5">
      {category && <><input type="hidden" name="id" value={category.id} /><input type="hidden" name="slug" value={category.slug} /></>}
      <FormSection title="Allmänt" description="Kategorin samlar listor under en rubrik på kundernas sida Listor.">
        <Field label="Namn"><Input name="name" required defaultValue={category?.name} placeholder="Bransch" /></Field>
        <Field label="Beskrivning" hint="Visas under rubriken."><Input name="description" defaultValue={category?.description ?? ""} placeholder="Företag i en bransch, samlade per ort." /></Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ikon" hint="Visas för listor som saknar logotyp."><FormSelect name="icon" ariaLabel="Ikon" defaultValue={category?.icon ?? "LibraryBig"} options={ICON_NAMES.map((n) => ({ value: n, label: n }))} className="!h-[42px] !rounded-xl" /></Field>
          <Field label="Sortering" hint="Lägst först."><Input name="sort" type="number" defaultValue={category?.sort ?? 50} /></Field>
        </div>
      </FormSection>
      <FormSection title="Texter" description="Styr vad kunderna läser under ett företag i en lista i kategorin.">
        <Checkbox name="names_brand" defaultChecked={category?.names_brand ?? false} label="Listorna är uppkallade efter ett varumärke (visa Vi har ingen koppling till X)" />
      </FormSection>
    </form>
  );
}
