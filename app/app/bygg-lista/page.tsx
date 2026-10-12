import Header from "@/components/dashboard/Header";
import ListView, { type ListSP } from "@/components/dashboard/ListView";
import { requireMember } from "@/lib/auth";

export default async function ListPage({ searchParams }: { searchParams: Promise<ListSP> }) {
  const m = await requireMember();
  return (
    <>
      <Header title="Bygg lista" subtitle="Filtrera på leverantör, lista och ort, förhandsgranska, ring eller exportera" />
      <ListView orgId={m.org.id} sp={await searchParams} basePath="/app/bygg-lista" />
    </>
  );
}
