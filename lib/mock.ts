// MOCKDATA. Byt ut mot riktig data från Prospekt innan lansering.
// Antal och verifieringsdatum måste alltid vara verkliga i publicerad copy.

export const VERIFIED = "oktober 2026";
export const TOTAL_COMPANIES = 52000; // ungefärligt antal i Prospekt

export type Row = {
  company: string;
  orgNr: string;
  city: string;
  signal: string;
  source: string;
};

// Fiktiva företag, endast för att visa hur en rad ser ut.
export const SAMPLE_ROWS: Row[] = [
  { company: "Exempel Frisör AB", orgNr: "556000-0001", city: "Göteborg", signal: "Betald profil på hitta.se", source: "hitta.se/exempel-frisor" },
  { company: "Provbygg Entreprenad AB", orgNr: "556000-0002", city: "Malmö", signal: "Webbleverantör: ROI", source: "provbygg.example/kontakt" },
  { company: "Testtandvård i Uppsala AB", orgNr: "556000-0003", city: "Uppsala", signal: "Betald profil på hitta.se", source: "hitta.se/testtandvard" },
  { company: "Demo VVS Service AB", orgNr: "556000-0004", city: "Västerås", signal: "Webbleverantör: ROI", source: "demovvs.example" },
  { company: "Prov Städ & Fastighet AB", orgNr: "556000-0005", city: "Örebro", signal: "Betald profil på hitta.se", source: "hitta.se/prov-stad" },
];

export const SUPPLIERS = ["hitta.se", "ROI"]; // exempel, fler läggs till med data
