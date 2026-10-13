import sharp from "sharp";
import { pool } from "./db";
import { imageKind } from "./storage";
import type { QueueOrder } from "./dialer/order";
import { QUEUE_ORDERS } from "./dialer/order";
import type { QueueTemplate } from "./dialer/scope";

// Den inloggades profil och inställningar. Namnet ligger i profiles.full_name, resten i member_prefs (0003, 0022).

export const NAME_MAX = 60;
export const AVATAR_SIZE = 256;
/** Så stor får en uppladdad bild vara innan den förminskas. */
export const AVATAR_MAX_BYTES = 6_000_000;
/** Kortaste sidan: mindre bilder är ikoner, inte porträtt. */
export const AVATAR_MIN_SIDE = 64;

/** Ett namn att visa: trimmat, mellanslag hopslagna, 1 till 60 tecken, inga styrtecken eller länkar. Ren. */
export function cleanName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length === 0) return { ok: false, error: "Skriv ditt namn." };
  if (name.length > NAME_MAX) return { ok: false, error: `Namnet får vara högst ${NAME_MAX} tecken.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f<>]/.test(name) || /https?:\/\//i.test(name)) return { ok: false, error: "Namnet får inte innehålla länkar eller specialtecken." };
  return { ok: true, name };
}

/** Förminskar en uppladdad bild till ett kvadratiskt porträtt. Null när det inte är en bild vi kan använda. */
export async function makeAvatar(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (bytes.byteLength === 0 || bytes.byteLength > AVATAR_MAX_BYTES || !imageKind(bytes)) return null;
  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < AVATAR_MIN_SIDE) return null;
    return new Uint8Array(await sharp(bytes).rotate().resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" }).webp({ quality: 80 }).toBuffer());
  } catch {
    return null;
  }
}

export interface Account {
  fullName: string | null;
  email: string;
  avatarPath: string | null;
}

export async function getAccount(userId: string): Promise<Account | null> {
  const { rows } = await pool.query(`select full_name, email::text as email, avatar_path from profiles where user_id = $1`, [userId]);
  const r = rows[0];
  return r ? { fullName: r.full_name ?? null, email: r.email, avatarPath: r.avatar_path ?? null } : null;
}

export async function updateName(userId: string, name: string): Promise<void> {
  await pool.query(`update profiles set full_name = $2 where user_id = $1`, [userId, name]);
}

export async function setAvatarPath(userId: string, path: string | null): Promise<string | null> {
  const { rows } = await pool.query(`select avatar_path from profiles where user_id = $1`, [userId]);
  await pool.query(`update profiles set avatar_path = $2 where user_id = $1`, [userId, path]);
  return (rows[0]?.avatar_path as string | null | undefined) ?? null;
}

export interface Prefs {
  order: QueueOrder;
  /** Mallen en ny lista i "Att ringa" börjar med. Ingen = allt att ringa. */
  template: QueueTemplate | null;
  callbackEmail: boolean;
}

export const DEFAULT_PREFS: Prefs = { order: "slump", template: null, callbackEmail: false };

export async function getPrefs(userId: string): Promise<Prefs> {
  const { rows } = await pool.query(`select queue_order, default_template, callback_email from member_prefs where user_id = $1`, [userId]);
  const r = rows[0];
  return r ? { order: r.queue_order as QueueOrder, template: (r.default_template as QueueTemplate | null) ?? null, callbackEmail: r.callback_email === true } : DEFAULT_PREFS;
}

/** Tar emot värden från ett formulär och släpper bara igenom giltiga. Ren. */
export function parsePrefs(f: { order?: string | null; template?: string | null; callbackEmail?: string | null }): Prefs {
  const order = QUEUE_ORDERS.some((o) => o.value === f.order) ? (f.order as QueueOrder) : DEFAULT_PREFS.order;
  const template = f.template === "fresh" || f.template === "noanswer" ? f.template : null;
  return { order, template, callbackEmail: f.callbackEmail === "on" || f.callbackEmail === "1" };
}

export async function savePrefs(userId: string, p: Prefs): Promise<void> {
  await pool.query(
    `insert into member_prefs (user_id, queue_order, default_template, callback_email) values ($1,$2,$3,$4)
     on conflict (user_id) do update set queue_order = excluded.queue_order, default_template = excluded.default_template, callback_email = excluded.callback_email`,
    [userId, p.order, p.template, p.callbackEmail],
  );
}
