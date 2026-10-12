"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { pool } from "@/lib/db";
import { CallError, logCall, setArchived, undoCall } from "@/lib/calls/log";
import { setQueueOrder, type QueueOrder, QUEUE_ORDERS } from "@/lib/dialer/queue";
import { stockholmToUtc } from "@/lib/time";

const UUID = /^[0-9a-f-]{36}$/i;
const safePath = (p: string) => (p.startsWith("/app") && !p.startsWith("//") ? p : "/app/ring");

/** Samtalsformuläret: utfall, anteckning, återkomst (datum + valfri tid), möte (datum + tid), arkivera. */
export async function logCallAction(formData: FormData) {
  const m = await requireMember();
  const companyId = String(formData.get("company_id") ?? "");
  if (!UUID.test(companyId)) throw new Error("Ogiltigt företag");

  const cbDate = String(formData.get("callback_date") ?? "");
  const cbTime = String(formData.get("callback_time") ?? "");
  const meeting = String(formData.get("meeting_at") ?? "");
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(cbDate);
  const hasTime = /^\d{2}:\d{2}$/.test(cbTime);

  await logCall({
    orgId: m.org.id,
    user: { id: m.user.id, email: m.user.email },
    companyId,
    outcome: String(formData.get("outcome") ?? ""),
    note: String(formData.get("note") ?? ""),
    callbackAt: hasDate ? stockholmToUtc(`${cbDate}T${hasTime ? cbTime : "00:00"}`) : null,
    callbackHasTime: hasDate && hasTime,
    meetingAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(meeting) ? stockholmToUtc(meeting) : null,
    archive: formData.get("archive") === "on",
  });
  redirect(safePath(String(formData.get("redirect_to") ?? "")));
}

export async function archiveAction(formData: FormData) {
  const m = await requireMember();
  const companyId = String(formData.get("company_id") ?? "");
  if (!UUID.test(companyId)) return;
  await setArchived(m.org.id, m.user.id, companyId, formData.get("archived") === "1");
  revalidatePath("/app", "layout");
  redirect(safePath(String(formData.get("redirect_to") ?? "")));
}

export async function queueOrderAction(formData: FormData) {
  const m = await requireMember();
  const order = String(formData.get("order") ?? "") as QueueOrder;
  if (!QUEUE_ORDERS.some((o) => o.value === order)) return;
  await setQueueOrder(m.user.id, order);
  redirect(safePath(String(formData.get("redirect_to") ?? "")));
}

export type SaveResult = { ok: true; logId: string } | { ok: false; error: string };

/** Ringlägets spara: returnerar resultatet i stället för att omdirigera, så att klienten kan gå vidare direkt. */
export async function saveCall(input: {
  companyId: string;
  outcome: string;
  note: string;
  callbackDate: string | null;
  callbackTime: string | null;
  meetingAt: string | null;
  archive: boolean;
}): Promise<SaveResult> {
  const m = await requireMember();
  if (!UUID.test(input.companyId)) return { ok: false, error: "Ogiltigt företag." };
  const hasDate = !!input.callbackDate && /^\d{4}-\d{2}-\d{2}$/.test(input.callbackDate);
  const hasTime = !!input.callbackTime && /^\d{2}:\d{2}$/.test(input.callbackTime);
  try {
    const { logId } = await logCall({
      orgId: m.org.id,
      user: { id: m.user.id, email: m.user.email },
      companyId: input.companyId,
      outcome: input.outcome,
      note: input.note,
      callbackAt: hasDate ? stockholmToUtc(`${input.callbackDate}T${hasTime ? input.callbackTime : "00:00"}`) : null,
      callbackHasTime: hasDate && hasTime,
      meetingAt: input.meetingAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.meetingAt) ? stockholmToUtc(input.meetingAt) : null,
      archive: input.archive,
    });
    return { ok: true, logId };
  } catch (e) {
    if (e instanceof CallError) return { ok: false, error: e.message };
    console.error("saveCall misslyckades", e);
    return { ok: false, error: "Kunde inte spara samtalet." };
  }
}

export async function undoCallAction(logId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await requireMember();
  if (!UUID.test(logId)) return { ok: false, error: "Ogiltigt samtal." };
  try {
    await undoCall(m.org.id, m.user.id, logId);
    return { ok: true };
  } catch (e) {
    if (e instanceof CallError) return { ok: false, error: e.message };
    console.error("undoCall misslyckades", e);
    return { ok: false, error: "Kunde inte ångra samtalet." };
  }
}

export type NoteResult = { ok: true; note: { id: string; body: string; createdAt: string; userEmail: string } } | { ok: false; error: string };

/** En fri anteckning på ett företag, delad inom bolaget. Visas i tråden i ringläget. */
export async function addNote(companyId: string, body: string): Promise<NoteResult> {
  const m = await requireMember();
  const text = body.trim();
  if (!UUID.test(companyId)) return { ok: false, error: "Ogiltigt företag." };
  if (text.length < 1 || text.length > 2000) return { ok: false, error: "Anteckningen måste vara mellan 1 och 2000 tecken." };
  try {
    const { rows } = await pool.query(
      `insert into company_notes (org_id, company_id, user_id, user_email, body)
       select $1, c.id, $3, $4, $5 from companies c where c.id = $2
       returning id, body, created_at, user_email`,
      [m.org.id, companyId, m.user.id, m.user.email, text],
    );
    if (!rows[0]) return { ok: false, error: "Företaget finns inte." };
    return { ok: true, note: { id: rows[0].id, body: rows[0].body, createdAt: new Date(rows[0].created_at).toISOString(), userEmail: rows[0].user_email } };
  } catch (e) {
    console.error("addNote misslyckades", e);
    return { ok: false, error: "Kunde inte spara anteckningen." };
  }
}
