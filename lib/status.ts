// Klientsäker (ingen databasimport). Samtalsutfall finns i lib/calls/outcomes.ts.
export const KINDS = [
  { value: "aterringning", label: "Återringning", block: "bg-[#F26522] text-white" },
  { value: "mote", label: "Möte", block: "bg-[#14161F] text-white" },
  { value: "ovrigt", label: "Övrigt", block: "bg-gray-300 text-gray-900" },
] as const;

export const kindMeta = (v: string) => KINDS.find((k) => k.value === v) ?? KINDS[2];
