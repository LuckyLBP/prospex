/** Länk som öppnar en sökning på Google Maps i webbläsaren, för att kontrollera ett företag för hand. Ingen API-nyckel behövs. Ren. */
export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}
