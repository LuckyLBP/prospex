/** Var en meny ska ligga: under knappen, eller över den när det inte får plats under. Ren, så att den går att testa. */
export interface Placement {
  left: number;
  /** Avstånd från fönstrets överkant, när menyn öppnas nedåt. */
  top?: number;
  /** Avstånd från fönstrets nederkant, när menyn öppnas uppåt. */
  bottom?: number;
}

export function placeMenu(button: { top: number; bottom: number; left: number }, viewport: { width: number; height: number }, menu: { width: number; height: number }, gap = 6): Placement {
  const left = Math.max(8, Math.min(button.left, viewport.width - menu.width - 8));
  const roomBelow = viewport.height - button.bottom - gap;
  const roomAbove = button.top - gap;
  // Nedåt om det får plats, eller om det finns mer plats där än ovanför.
  if (roomBelow >= menu.height || roomBelow >= roomAbove) return { left, top: button.bottom + gap };
  return { left, bottom: viewport.height - button.top + gap };
}
