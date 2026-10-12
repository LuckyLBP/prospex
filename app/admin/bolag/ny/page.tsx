import PageHeader from "@/components/admin/PageHeader";
import { Field, FormSection, Input } from "@/components/admin/FormSection";
import { Flash } from "@/components/admin/bits";
import { btnPrimary } from "@/components/admin/ui";
import { createOrgAction } from "../actions";

export default async function NewOrgPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader back={{ href: "/admin/bolag", label: "Bolag" }} title="Nytt bolag" subtitle="Skapa ett kundbolag och bjud in dess ägare" />
      <Flash error={sp.error} />
      <form action={createOrgAction}>
        <FormSection title="Bolaget" description="Ägaren får ett mejl och loggar in med en kod. Hen kan sedan själv bjuda in resten av teamet."
          footer={<button className={btnPrimary}>Skapa bolag</button>}>
          <Field label="Bolagsnamn"><Input name="name" required placeholder="Effektiv Media" /></Field>
          <Field label="Ägarens e-post"><Input name="owner_email" type="email" required placeholder="agare@foretag.se" /></Field>
        </FormSection>
      </form>
    </>
  );
}
