import type { DialerCard } from "@/lib/dialer/card-types";
import type { DialerScope, QueueMode } from "@/lib/dialer/scope";
import type { QueueOrder } from "@/lib/dialer/order";

export type DialerInit = {
  ids: string[];
  startIndex: number;
  cards: DialerCard[];
  scope: DialerScope & { mode: QueueMode };
  order: QueueOrder;
  /** Alla publicerade källor: leverantörer först, sedan listor per kategori. */
  suppliers: { slug: string; name: string; n: number; logo: string | null; kind: "supplier" | "list"; category: string | null; icon: string | null }[];
  stats: { callsToday: number };
  queueBuiltAt: number;
  /** Kön är kapad vid taket (QUEUE_LIMIT). */
  capped: boolean;
  /** Den inloggades e-post, för att skilja mina inlägg från kollegornas i tråden. */
  me: string;
  /** Signatur per företags-id (lib/access/tokens). Ett kort går bara att hämta med den. */
  macs: Record<string, string>;
  /** Gränsen för hur många företag som släpps är nådd redan vid inladdningen. */
  limit: string | null;
};
