/** "Frisörer & Salonger" -> "frisorer-salonger". Rent, utan beroenden. */
export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/å|ä/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
