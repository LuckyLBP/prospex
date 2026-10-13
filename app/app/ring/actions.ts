"use server";

import { requireMember } from "@/lib/auth";
import { finishList, savePosition } from "@/lib/dialer/lists";

const UUID = /^[0-9a-f-]{36}$/i;

/** Sparar var i listan den som ringer är, så att hen kan fortsätta där senare. Tyst om något är fel: det är bara en bekvämlighet. */
export async function saveListPositionAction(companyId: string): Promise<void> {
  const m = await requireMember();
  if (!UUID.test(companyId)) return;
  await savePosition(m.org.id, m.user.id, companyId);
}

/** Markerar listan som klar. */
export async function finishListAction(): Promise<void> {
  const m = await requireMember();
  await finishList(m.org.id, m.user.id);
}
