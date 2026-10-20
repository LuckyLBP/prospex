export type Stat = { value: string; label: string };

/** Tre riktiga siffror ur katalogen, i ett band under hjälten. */
export default function Stats({ items }: { items: Stat[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Siffror" className="mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-12">
      <dl className="grid divide-y divide-line rounded-card bg-surface shadow-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((s) => (
          <div key={s.label} className="px-7 py-6">
            <dt className="text-[13px] text-muted">{s.label}</dt>
            <dd className="tabular mt-1 text-[32px] font-semibold tracking-[-0.03em] text-ink">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
