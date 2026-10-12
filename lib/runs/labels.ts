// Klientsäker: svenska namn på insamlingsmetoderna.
export const METHOD_LABEL: Record<string, string> = {
  publicwww: "PublicWWW",
  viewdns: "ViewDNS",
  script: "Skript",
  domainlist: "Domänlista",
  googleplaces: "Google Places",
  agency: "Byrå",
};
export const methodLabel = (m: string | null | undefined) => (m ? (METHOD_LABEL[m] ?? m) : "Ingen");
