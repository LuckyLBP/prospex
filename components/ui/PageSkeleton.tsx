/** Laddningsskelett som visas direkt vid navigering medan sidan renderas på servern. */
export default function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Laddar">
      <div className="h-8 w-56 rounded-xl bg-gray-200/70" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-gray-200/60" />)}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => <div key={i} className="h-12 rounded-xl bg-gray-200/50" />)}
      </div>
    </div>
  );
}
