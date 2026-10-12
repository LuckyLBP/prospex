// Klientsäker (ingen databasimport): ordningsalternativen delas av servern och ringlägets verktygsrad.
export type QueueOrder = "slump" | "namn" | "ort" | "nyast";

export const QUEUE_ORDERS: { value: QueueOrder; label: string }[] = [
  { value: "slump", label: "Slumpad" },
  { value: "namn", label: "Namn A-Ö" },
  { value: "ort", label: "Ort" },
  { value: "nyast", label: "Nyast först" },
];
