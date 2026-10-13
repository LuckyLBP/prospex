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
  /** Ett enda företag, öppnat från sök eller en lista i stället för ur kön. Ingen kö, inget hoppa över. */
  single?: boolean;
  /**
   * Den sparade listan i "Att ringa". `offset`: hur många i listan som redan är avklarade när sidan laddades (en fortsatt
   * lista har tappat de som ringts sedan sist), `total`: listans ursprungliga längd, `resumed`: den fortsattes från sparat läge.
   * Null i Återkomster och Mina, som inte sparas.
   */
  list?: { offset: number; total: number; resumed: boolean } | null;
};
