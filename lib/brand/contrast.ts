// WCAG-kontrast för varumärkets färger. Används av testet och av /admin/varumarke.

const channel = (hex: string, i: number) => {
  const v = parseInt(hex.slice(i, i + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const luminance = (hex: string): number => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

/** Kontrastförhållandet mellan två färger, 1 till 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** AA för löpande text. */
export const AA_TEXT = 4.5;
/** AA för stor text och grafik. */
export const AA_UI = 3;
