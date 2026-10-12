import { COLORS, DOT, GRID, HOLE, P_D, TILE_RADIUS, holeD } from "@/brand/geometry.mjs";
import { WORDMARK } from "@/brand/wordmark.generated.mjs";

// Prospex logotyp i appen. Samma former som filerna i public/brand, ritade av samma geometri (brand/geometry.mjs).

type MarkProps = {
  /** Sidan i pixlar. */
  size?: number;
  /** Större hål och ingen prick: för storlekar under cirka 24 px. */
  small?: boolean;
  /** Utan platta: bara bokstaven, i `color`. För en färg, till exempel i tryck eller på orange bakgrund. */
  bare?: boolean;
  color?: string;
  className?: string;
  title?: string;
};

function Glyph({ fg, small }: { fg: string; small: boolean }) {
  return (
    <>
      <path fill={fg} fillRule="evenodd" d={P_D + holeD(small ? HOLE.rSmall : HOLE.r)} />
      {!small && <circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill={fg} />}
    </>
  );
}

/** Märket: ett P med en signalprick i, på en orange platta. */
export function LogoMark({ size = 40, small = size < 24, bare = false, color = COLORS.ink, className, title = "Prospex" }: MarkProps) {
  return bare ? (
    <svg viewBox="14 10 40 44" width={size} height={(size * 44) / 40} role="img" aria-label={title} className={className}><Glyph fg={color} small={small} /></svg>
  ) : (
    <svg viewBox={`0 0 ${GRID} ${GRID}`} width={size} height={size} role="img" aria-label={title} className={className}>
      <rect width={GRID} height={GRID} rx={TILE_RADIUS} fill={COLORS.accent} />
      <Glyph fg={COLORS.ink} small={small} />
    </svg>
  );
}

/** Märket och ordmärket "prospex" bredvid varandra. `theme`: vilken bakgrund den ligger på. */
export function Logo({ height = 32, theme = "light", className, title = "Prospex" }: { height?: number; theme?: "light" | "dark"; className?: string; title?: string }) {
  const word = theme === "dark" ? COLORS.white : COLORS.ink;
  return (
    <svg viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`} width={(height * WORDMARK.width) / WORDMARK.height} height={height} role="img" aria-label={title} className={className}>
      <rect width={GRID} height={GRID} rx={TILE_RADIUS} fill={COLORS.accent} />
      <Glyph fg={COLORS.ink} small={height < 24} />
      <path transform={`translate(${WORDMARK.x} ${WORDMARK.baseline})`} fill={word} d={WORDMARK.d} />
    </svg>
  );
}
