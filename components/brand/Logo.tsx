import { COLORS, GRID, TILE_RADIUS, TONES } from "@/brand/geometry.mjs";
import { MARK, MARK_SMALL, WORDMARK } from "@/brand/wordmark.generated.mjs";

// Prospex logotyp i appen. Samma former som filerna i public/brand, ritade av samma data (brand/wordmark.generated.mjs).
// Logotypen är ordmärket "prospex" med en orange punkt. "p." på en platta är till för små fyrkantiga ytor.

type MarkProps = {
  /** Sidan i pixlar. */
  size?: number;
  /** `ink`: mörk platta, för ljusa ytor. `accent`: orange platta, för mörka ytor (till exempel den mörka menyn). */
  tone?: "ink" | "accent";
  className?: string;
  title?: string;
};

/** "p." på en rundad platta: favicon, appikon och den hopfällda menyn. Under 24 px ritas en större prick och bokstav. */
export function LogoMark({ size = 40, tone = "ink", className, title = "Prospex" }: MarkProps) {
  const t = TONES[tone as keyof typeof TONES];
  const m = size < 24 ? MARK_SMALL : MARK;
  return (
    <svg viewBox={`0 0 ${GRID} ${GRID}`} width={size} height={size} role="img" aria-label={title} className={className}>
      <rect width={GRID} height={GRID} rx={TILE_RADIUS} fill={t.bg} />
      <path fill={t.fg} d={m.d} />
      <circle cx={m.dot.cx} cy={m.dot.cy} r={m.dot.r} fill={t.dot} />
    </svg>
  );
}

/** Ordmärket "prospex" med den orange punkten. `theme`: vilken bakgrund det ligger på. `height` är hela ytans höjd, texten fyller ungefär hälften. */
export function Logo({ height = 32, theme = "light", className, title = "Prospex" }: { height?: number; theme?: "light" | "dark"; className?: string; title?: string }) {
  const word = theme === "dark" ? COLORS.white : COLORS.ink;
  return (
    <svg viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`} width={(height * WORDMARK.width) / WORDMARK.height} height={height} role="img" aria-label={title} className={className}>
      <g transform={`translate(${WORDMARK.x} ${WORDMARK.baseline})`}>
        {WORDMARK.parts.map((p, i) => <path key={i} fill={p.accent ? COLORS.accent : word} d={p.d} />)}
        {WORDMARK.dot && <circle cx={WORDMARK.dot.cx} cy={WORDMARK.dot.cy} r={WORDMARK.dot.r} fill={COLORS.accent} />}
      </g>
    </svg>
  );
}
