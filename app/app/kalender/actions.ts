"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { KINDS } from "@/lib/status";
import { stockholmToUtc } from "@/lib/time";
import { rotateFeedToken } from "@/lib/workflow";

export async function createEvent(formData: FormData) {
  const m = await requireMember();
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "ovrigt");
  const start = String(formData.get("start") ?? "");
  const minutes = Math.min(24 * 60, Math.max(5, Number(formData.get("minutes")) || 30));
  if (!title || !KINDS.some((k) => k.value === kind) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) throw new Error("Ogiltig händelse");

  const startsAt = stockholmToUtc(start);
  await pool.query(
    `insert into calendar_events (org_id, user_id, kind, title, starts_at, ends_at) values ($1,$2,$3,$4,$5,$6)`,
    [m.org.id, m.user.id, kind, title.slice(0, 200), startsAt, new Date(startsAt.getTime() + minutes * 60_000)],
  );
  redirect(`/app/kalender?w=${start.slice(0, 10)}`);
}

export async function deleteEvent(formData: FormData) {
  const m = await requireMember();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await pool.query(`delete from calendar_events where id = $1 and user_id = $2`, [id, m.user.id]);
  revalidatePath("/app/kalender");
}

export async function rotateFeed() {
  const m = await requireMember();
  await rotateFeedToken(m.user.id);
  revalidatePath("/app/kalender");
}
