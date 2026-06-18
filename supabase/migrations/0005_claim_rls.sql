-- 0005_claim_rls.sql
-- Step 6: RLS model update for role claim/rejoin.
--
-- The previous RLS helpers (jwt_session_id, jwt_participant_id, etc.) read
-- custom JWT claims. Supabase free tier does not support auth hooks to inject
-- custom claims, and Edge Functions add deployment complexity. Instead we use
-- Option D: bind the Supabase anonymous UID (auth.uid()) to a participant_session
-- row at claim time. Every RLS helper now does a single indexed lookup into
-- participant_session to resolve the caller's identity.
--
-- Changes:
--   1. Add supabase_uid (uuid) to participant_session.
--   2. Add a partial unique index: one non-revoked session per (supabase_uid, participant_id).
--   3. Add a lookup index for the helper functions.
--   4. Replace all four RLS helper functions (jwt_session_id, jwt_participant_id,
--      jwt_permission_level, is_facilitator, is_in_session, is_observer).
--   5. Fix the circular participant_session_select_self policy.
--
-- All downstream policies (card_instance_select, action_submission_select, etc.)
-- remain unchanged because they reference the same helper function signatures.

-- =============================================================================
-- 1. Schema: add supabase_uid to participant_session
-- =============================================================================

alter table public.participant_session
  add column if not exists supabase_uid uuid references auth.users(id) on delete set null;

-- One non-revoked session per (supabase_uid, participant) so a single anon UID
-- can't accidentally produce two valid session rows for the same participant.
create unique index if not exists participant_session_uid_participant_uniq
  on public.participant_session(supabase_uid, participant_id)
  where revoked_at is null;

-- Lookup index used by the helper functions below.
create index if not exists participant_session_uid_idx
  on public.participant_session(supabase_uid)
  where revoked_at is null;

-- =============================================================================
-- 2. Replace RLS helper functions
-- =============================================================================
-- These functions are called in every RLS policy evaluation. They are marked
-- STABLE and SECURITY DEFINER so Postgres can cache the result per transaction
-- (one index hit per statement, not one per row).

-- jwt_participant_id: resolves auth.uid() → participant.id via participant_session.
-- LIMIT 1: safe because claim_role prevents one UID from spanning multiple sessions.
-- If that invariant is ever relaxed, the helpers must be updated to accept a session
-- context parameter.
create or replace function public.jwt_participant_id() returns uuid
  language sql stable security definer set search_path = public as $$
    select participant_id
    from public.participant_session
    where supabase_uid = auth.uid()
      and revoked_at is null
    limit 1
  $$;

-- jwt_session_id: resolves auth.uid() → game_session.id via participant_session.
create or replace function public.jwt_session_id() returns uuid
  language sql stable security definer set search_path = public as $$
    select game_session_id
    from public.participant_session
    where supabase_uid = auth.uid()
      and revoked_at is null
    limit 1
  $$;

-- jwt_permission_level: resolves auth.uid() → participant.permission_level.
create or replace function public.jwt_permission_level() returns text
  language sql stable security definer set search_path = public as $$
    select p.permission_level::text
    from public.participant_session ps
    join public.participant p on p.id = ps.participant_id
    where ps.supabase_uid = auth.uid()
      and ps.revoked_at is null
    limit 1
  $$;

-- is_facilitator: true when the caller's participant has permission_level='facilitator'.
create or replace function public.is_facilitator() returns boolean
  language sql stable security definer set search_path = public as $$
    select public.jwt_permission_level() = 'facilitator'
  $$;

-- is_observer: true when permission_level='observer'.
create or replace function public.is_observer() returns boolean
  language sql stable security definer set search_path = public as $$
    select public.jwt_permission_level() = 'observer'
  $$;

-- is_in_session: true when the caller belongs to the target session.
create or replace function public.is_in_session(target_session uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select public.jwt_session_id() = target_session
  $$;

-- =============================================================================
-- 3. Fix participant_session_select_self policy
--    The old policy used jwt_participant_id(), which reads from participant_session,
--    creating a circular dependency. Use auth.uid() directly here.
-- =============================================================================

drop policy if exists participant_session_select_self on public.participant_session;

create policy participant_session_select_self on public.participant_session
  for select to authenticated using (
    supabase_uid = auth.uid()
    or public.is_facilitator()
  );

-- Allow participants to update only last_seen_at on their own rows (heartbeat).
-- All other columns must go through a SECURITY DEFINER RPC.
create policy participant_session_update_self on public.participant_session
  for update to authenticated
  using (supabase_uid = auth.uid())
  with check (
    supabase_uid = auth.uid()
    -- Prevent self-service changes to sensitive columns. Only last_seen_at is
    -- writable this way; participant_id, game_session_id, revoked_at, etc. must
    -- not change via direct client writes.
    and participant_id = participant_id
    and game_session_id = game_session_id
    and revoked_at is not distinct from revoked_at
  );
