import { brandIcon, initialTile } from "@/lib/profile/tech-icons";

/** Varumärkesikon i en liten ruta, eller en initialruta när ikonen saknas. Serverkomponent: ikonen är en inbäddad SVG. */
export default function BrandIcon({ id, name, size = 32 }: { id?: string | null; name: string; size?: number }) {
  const icon = brandIcon({ id, name });
  const box = { width: size, height: size };
  if (icon) {
    return (
      <span aria-hidden className="flex shrink-0 items-center justify-center rounded-xl" style={{ ...box, backgroundColor: `#${icon.hex}1A` }}>
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill={`#${icon.hex}`}><path d={icon.path} /></svg>
      </span>
    );
  }
  const t = initialTile(name);
  return <span aria-hidden className="flex shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold" style={{ ...box, backgroundColor: t.bg, color: t.fg }}>{t.letter}</span>;
}
