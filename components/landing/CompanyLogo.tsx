/** Påhittade logotyper till de fiktiva företagen: enkla former i varumärkets färger. */
const MARKS = [
  { tile: "bg-ink", art: <><circle cx="14" cy="20" r="7" className="fill-accent" /><path d="M20 13a7 7 0 0 1 0 14z" className="fill-white" /></> },
  { tile: "bg-accent", art: <path d="M9 28V17l11-8 11 8v11h-7v-7h-8v7z" className="fill-ink" /> },
  { tile: "bg-accent-tint", art: <path d="M17 9h6v8h8v6h-8v8h-6v-8H9v-6h8z" className="fill-accent-text" /> },
  { tile: "bg-gray-800", art: <path d="M20 8c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15z" className="fill-white" /> },
  { tile: "bg-white ring-1 ring-line", art: <><rect x="10" y="10" width="9" height="20" rx="2" className="fill-ink" /><rect x="21" y="16" width="9" height="14" rx="2" className="fill-accent" /></> },
  { tile: "bg-ink", art: <path d="M20 9l3.2 7 7.3.8-5.5 5 1.6 7.3L20 25.4 13.4 29l1.6-7.3-5.5-5 7.3-.8z" className="fill-accent" /> },
];

export function CompanyLogo({ i, size = "md" }: { i: number; size?: "sm" | "md" }) {
  const m = MARKS[i % MARKS.length];
  return (
    <span className={`flex shrink-0 items-center justify-center ${size === "sm" ? "h-8 w-8 rounded-[10px]" : "h-11 w-11 rounded-xl"} ${m.tile}`}>
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">{m.art}</svg>
    </span>
  );
}
