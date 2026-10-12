// Stegen i ett profilbygge, i den ordning de körs. Klientsäker, så att sökfältet kan visa förloppet.

export type ProfileStage = "resolve" | "registry" | "website" | "people" | "network" | "ai" | "save";

export const STAGE_ORDER: ProfileStage[] = ["resolve", "registry", "website", "people", "network", "ai", "save"];

export const STAGE_LABEL: Record<ProfileStage, string> = {
  resolve: "Letar upp företaget",
  registry: "Hämtar från Bolagsverket",
  website: "Läser webbplatsen",
  people: "Letar kontaktpersoner",
  network: "Letar kopplingar",
  ai: "AI skriver profilen",
  save: "Sparar",
};
