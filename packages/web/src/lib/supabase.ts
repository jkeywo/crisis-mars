// Lazy Supabase client. Returns null when env vars are missing so the UI can render
// a clear "not configured" message instead of crashing.
//
// RLS model (step 6): custom JWT claims are NOT used. Instead, the anonymous
// user's `auth.uid()` is bound to a `participant_session` row at claim time,
// and RLS helper functions resolve identity via that table. This works on the
// free Supabase tier without Edge Functions or auth hooks.
//
// We use $env/dynamic/public so missing env vars at build time degrade gracefully
// to runtime checks instead of breaking the typecheck/build.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import type { Database } from '$shared/types/database';

let client: SupabaseClient<Database> | null | undefined;

function readEnv(): { url: string; key: string } | null {
  const url = env.PUBLIC_SUPABASE_URL ?? '';
  const key = env.PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) return null;
  return { url, key };
}

export function getSupabase(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;
  const cfg = readEnv();
  if (!cfg) {
    client = null;
    return null;
  }
  client = createClient<Database>(cfg.url, cfg.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return readEnv() !== null;
}

/**
 * Ensure the current browser session has an anonymous Supabase auth session.
 * If one already exists (localStorage), this is a no-op.
 * Returns the authenticated SupabaseClient or null if unconfigured.
 *
 * NOTE: If the player clears localStorage, their anon session is lost and they
 * must re-scan their role badge. The re-scan triggers check_my_session → if the
 * role was previously claimed by the same anon UID the flow is already gone,
 * so the player gets the restore_role path. This is expected behaviour for a
 * physical game where the badge IS the identity credential.
 */
export async function ensureAnonSession(): Promise<SupabaseClient<Database> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    await sb.auth.signInAnonymously();
  }
  return sb;
}
