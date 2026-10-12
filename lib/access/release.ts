import { getCards } from "@/lib/dialer/cards";
import type { DialerCard } from "@/lib/dialer/card-types";
import { LIMIT_MESSAGE, type LimitReason } from "./limits";
import { releaseCompanies, type Who } from "./meter";

/** Ringlägets kort för de företag som får släppas till användaren nu. Resten uteblir och `limited` säger varför. */
export async function getCardsMetered(who: Who, ids: readonly string[]): Promise<{ cards: DialerCard[]; limited: { reason: LimitReason; message: string } | null }> {
  const plan = await releaseCompanies(who, ids);
  const cards = await getCards(who.orgId, plan.allowed);
  return { cards, limited: plan.reason ? { reason: plan.reason, message: LIMIT_MESSAGE[plan.reason] } : null };
}
