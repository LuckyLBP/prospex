/** Fel vid start av en körning, med en mening som går att visa för den som tryckte på knappen. */
export class RunStartError extends Error {
  constructor(
    readonly code: "ACTIVE" | "NOT_FOUND" | "NO_METHOD",
    message: string,
  ) {
    super(message);
    this.name = "RunStartError";
  }
}

export const START_ERRORS = {
  ACTIVE: "En körning pågår redan.",
  NOT_FOUND: "Källan finns inte.",
  NO_METHOD: "Välj en insamlingsmetod och spara först.",
} as const;
