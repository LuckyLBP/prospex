"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { pool } from "@/lib/db";
import { RunStartError } from "@/lib/runs/errors";
import { cancelRun, requeueEnrichment } from "@/lib/runs/store";
import { triggerRun } from "@/lib/runs/start";

const UUID = /^[0-9a-f-]{36}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

async function source(id: string) {
  const { rows } = await pool.query(`select id, slug, name, kind from suppliers where id = $1`, [id]);
  return rows[0] as { id: string; slug: string; name: string; kind: string } | undefined;
}

/** Tillbaka till sidan där knappen låg, med ett besked i adressen. Måste vara en adress i admin. */
function back(f: FormData, kind: "ok" | "error", text: string): never {
  const to = str(f, "return_to");
  const path = to.startsWith("/admin/") && !to.includes("//") ? to.split("?")[0] : "/admin/insamling";
  redirect(`${path}?${kind}=${encodeURIComponent(text)}`);
}

async function start(f: FormData, stage: "collect" | "enrich", okText: string, action: "run.start" | "run.requeue", extra: () => Promise<Record<string, unknown>> = async () => ({})) {
  const a = await requireAdmin();
  const id = str(f, "supplier_id");
  if (!UUID.test(id)) return;
  const s = await source(id);
  if (!s) back(f, "error", "Källan finns inte.");
  let details: Record<string, unknown> = {};
  try {
    details = await extra();
    await triggerRun(id, { stage, triggeredBy: a.user.id });
  } catch (e) {
    if (e instanceof RunStartError) back(f, "error", e.message);
    back(f, "error", e instanceof Error ? e.message : "Kunde inte starta körningen.");
  }
  await audit(a.user, action, "source", { id: s.slug, name: s.name, details: { kind: s.kind, ...details } });
  revalidatePath("/admin", "layout");
  back(f, "ok", okText);
}

export async function runNowAction(f: FormData) {
  await start(f, "collect", "Körningen startades.", "run.start");
}

export async function requeueAction(f: FormData) {
  await start(f, "enrich", "Misslyckade webbplatser läses om.", "run.requeue", async () => ({ count: await requeueEnrichment(str(f, "supplier_id")) }));
}

export async function cancelRunAction(f: FormData) {
  const a = await requireAdmin();
  const runId = str(f, "run_id");
  if (!UUID.test(runId)) return;
  const { rows } = await pool.query(`select s.slug, s.name, s.kind from scrape_runs r join suppliers s on s.id = r.supplier_id where r.id = $1`, [runId]);
  const cancelled = await cancelRun(runId);
  if (cancelled && rows[0]) await audit(a.user, "run.cancel", "source", { id: rows[0].slug, name: rows[0].name, details: { kind: rows[0].kind } });
  revalidatePath("/admin", "layout");
  back(f, cancelled ? "ok" : "error", cancelled ? "Körningen avbröts." : "Körningen var redan klar.");
}
