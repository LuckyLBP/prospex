/** Profilbilden, eller initialen när det inte finns någon. */
export default function Avatar({ name, url, size = 32, className = "" }: { name: string; url?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) };
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} style={style} className={`shrink-0 rounded-full bg-accent-tint object-cover ${className}`} />
  ) : (
    <span style={style} className={`flex shrink-0 items-center justify-center rounded-full bg-accent-tint font-semibold text-accent-text ${className}`} aria-hidden>{name.trim().charAt(0).toUpperCase() || "?"}</span>
  );
}
