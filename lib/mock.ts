// Fiktiva exempelrader till förhandsvisningen på startsidan. Antal och datum på sidan räknas ur databasen (app/page.tsx).

export type Row = {
  company: string;
  orgNr: string;
  city: string;
  signal: string;
  source: string;
};

// Fiktiva företag, endast för att visa hur en rad ser ut.
export const SAMPLE_ROWS: Row[] = [
  { company: "Exempel Frisör AB", orgNr: "556000-0001", city: "Göteborg", signal: "Webbplats skapad av Mediabyrå AB", source: "exempel-frisor.example" },
  { company: "Provbygg Entreprenad AB", orgNr: "556000-0002", city: "Malmö", signal: "Webbplats skapad av Webbstudio AB", source: "provbygg.example/kontakt" },
  { company: "Testtandvård i Uppsala AB", orgNr: "556000-0003", city: "Uppsala", signal: "Webbplats skapad av Mediabyrå AB", source: "testtandvard.example" },
  { company: "Demo VVS Service AB", orgNr: "556000-0004", city: "Västerås", signal: "Webbplats skapad av Digitalbyrån AB", source: "demovvs.example" },
  { company: "Prov Städ & Fastighet AB", orgNr: "556000-0005", city: "Örebro", signal: "Webbplats skapad av Webbstudio AB", source: "provstad.example" },
];
