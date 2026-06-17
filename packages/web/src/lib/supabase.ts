// Lazy Supabase client. Returns null when env vars are missing so the UI can render
// a clear "not configured" message instead of crashing.
//
// The anon key is safe to ship in client builds because Row-Level Security in
// supabase/migrations/0002_rls.sql gates every table access on the participant_id
// claim inside the user's JWT, which is issued only after a valid join/role claim.
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
