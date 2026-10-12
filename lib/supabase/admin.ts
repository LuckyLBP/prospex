import { createClient } from "@supabase/supabase-js";

/** Serverklient med hemlig nyckel (förbi RLS). Null om nyckeln inte är satt. Används bara på servern. */
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
