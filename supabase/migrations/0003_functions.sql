-- 0003_functions.sql
-- SECURITY DEFINER RPCs for state-changing operations. Each function:
--   * Authorisation check (caller permitted)
--   * Pre-condition validation (state, ownership, phase, quota)
--   * The state change (single transaction)
--   * An audit_event or card_audit_event insert
--
-- Conventions:
--   * Raw tokens NEVER leave Postgres. Callers pass raw tokens in, we hash here.
--   * Use `set search_path = public` to make functions deterministic.
--   * `revoke all from public; grant execute to <role>` per function.
--   * Return tables, not OUT params, so PostgREST exposes them as RPCs.
--
-- Functions to add as features land (see build priority):
--   step 5  generate_role_access_tokens(game_session_id) returns table(role_code, token, manual_code)
--   step 6  claim_role(game_session_id, role_token) returns ...
--           restore_role(game_session_id, role_token, device_label) returns ...
--   step 12 place_action_card(action_card_instance_id, map_id, location_id) returns ...
--   step 15 loan_resource_card / recall_resource_card / reclaim_resource_card
--   step 14 resolve_action(action_submission_id, resolution_payload)
--   step 23 facilitator_move_card(card_instance_id, new_holder_id, reason)
--
-- =============================================================================
-- Step 4 - Session creation
-- =============================================================================

-- create_game_session: atomic creation of a session row + its NPC participants
-- + its map_score_value seed rows + audit events. The caller supplies the three
-- session-level tokens already-generated (24 random bytes each, base64url) so
-- they can show the raw tokens to the operator on stdout without ever round-
-- tripping the raw value through Postgres logs. We only store hashes.
--
-- Contract:
--   * Service-role only in practice (the function is callable by anon by
--     PostgREST defaults, but the operator workflow runs it via the service
--     role from scripts/create-session.mjs). When step 6's JWT issuer lands,
--     this function will be gated on a master-admin claim or remain
--     service-role-only as an operator-side tool.
--   * Tokens are SHA-256 hashed (hex) using pgcrypto's digest().
--   * NPC participant rows are created with controlled_by_facilitator_id NULL;
--     step 8 (casting dashboard) will populate this once a facilitator
--     participant row exists.
--   * map_score_value rows are seeded from map_score_track.starting_value for
--     every track on every map under the scenario.
--   * Three audit_event rows are written: session.created,
--     session.npc_seeded (x N), session.scores_seeded.

create or replace function public.create_game_session(
  p_scenario_id text,
  p_title text,
  p_join_token text,
  p_facilitator_token text,
  p_observer_token text
)
returns table (
  game_session_id uuid,
  npc_participant_ids uuid[],
  score_value_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_npc_ids uuid[];
  v_score_count int;
  v_schedule jsonb;
  v_prologue_seconds int;
  v_track_ids text[];
  v_now timestamptz := now();
begin
  -- Pre-condition: scenario must exist.
  if not exists (select 1 from public.scenario where id = p_scenario_id) then
    raise exception 'scenario % does not exist', p_scenario_id using errcode = 'P0001';
  end if;

  if p_join_token is null or length(p_join_token) < 16 then
    raise exception 'p_join_token must be at least 16 characters' using errcode = 'P0001';
  end if;
  if p_facilitator_token is null or length(p_facilitator_token) < 16 then
    raise exception 'p_facilitator_token must be at least 16 characters' using errcode = 'P0001';
  end if;
  if p_join_token = p_facilitator_token then
    raise exception 'join and facilitator tokens must be distinct' using errcode = 'P0001';
  end if;
  if p_observer_token is not null then
    if p_observer_token = p_join_token then
      raise exception 'observer and join tokens must be distinct' using errcode = 'P0001';
    end if;
    if p_observer_token = p_facilitator_token then
      raise exception 'observer and facilitator tokens must be distinct' using errcode = 'P0001';
    end if;
  end if;

  -- Read the scenario schedule so we know the prologue duration.
  select default_schedule_json into v_schedule
  from public.scenario
  where id = p_scenario_id;
  v_prologue_seconds := coalesce((v_schedule ->> 'prologue_seconds')::int, 1800);

  -- 1. game_session row
  insert into public.game_session (
    scenario_id,
    title,
    status,
    current_turn,
    current_phase,
    phase_started_at,
    phase_duration_seconds,
    join_code_hash,
    facilitator_code_hash,
    observer_code_hash
  )
  values (
    p_scenario_id,
    p_title,
    'live'::session_status,
    0,
    'prologue'::phase_kind,
    v_now,
    v_prologue_seconds,
    encode(digest(p_join_token, 'sha256'), 'hex'),
    encode(digest(p_facilitator_token, 'sha256'), 'hex'),
    case when p_observer_token is null then null
         else encode(digest(p_observer_token, 'sha256'), 'hex')
    end
  )
  returning id into v_session_id;

  -- 2. NPC participant rows, one per npc_template under this scenario.
  --    Constraint participant_npc_has_template requires role_id NULL and
  --    npc_template_id NOT NULL.
  with inserted as (
    insert into public.participant (
      game_session_id,
      display_name,
      participant_type,
      role_id,
      faction_id,
      npc_template_id,
      permission_level,
      controlled_by_facilitator_id,
      role_claimed_at,
      role_claimed_by_name,
      active_device_count,
      is_role_locked
    )
    select
      v_session_id,
      t.name,
      'npc'::participant_type,
      null,
      null,
      t.id,
      'player'::permission_level,
      null,
      v_now,
      '(facilitator)',
      0,
      false
    from public.npc_template t
    where t.scenario_id = p_scenario_id
    order by t.code
    returning id, npc_template_id
  )
  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_npc_ids
  from inserted;

  -- 3. map_score_value rows, one per (session, score_track) under the scenario.
  with inserted as (
    insert into public.map_score_value (
      game_session_id,
      score_track_id,
      current_value,
      updated_at
    )
    select
      v_session_id,
      t.id,
      t.starting_value,
      v_now
    from public.map_score_track t
    join public.map m on m.id = t.map_id
    where m.scenario_id = p_scenario_id
    returning score_track_id
  )
  select
    count(*),
    coalesce(array_agg(score_track_id order by score_track_id), array[]::text[])
    into v_score_count, v_track_ids
  from inserted;

  -- 4. Audit events. actor_facilitator_id is NULL: no facilitator participant
  --    row exists yet (step 8 introduces them). Recorded as service-role op.
  insert into public.audit_event (game_session_id, event_type, event_payload_json)
  values (
    v_session_id,
    'session.created',
    jsonb_build_object(
      'scenario_id', p_scenario_id,
      'title', p_title,
      'created_via', 'rpc.create_game_session',
      'status_at_creation', 'live',
      'schedule_seconds', jsonb_build_object(
        'prologue', v_prologue_seconds,
        'epilogue', coalesce((v_schedule ->> 'epilogue_seconds')::int, 600)
      )
    )
  );

  insert into public.audit_event (game_session_id, event_type, event_payload_json)
  select
    v_session_id,
    'session.npc_seeded',
    jsonb_build_object(
      'participant_id', p.id,
      'npc_code', t.code,
      'npc_name', t.name,
      'default_controller', t.default_controller
    )
  from public.participant p
  join public.npc_template t on t.id = p.npc_template_id
  where p.game_session_id = v_session_id
    and p.participant_type = 'npc';

  insert into public.audit_event (game_session_id, event_type, event_payload_json)
  values (
    v_session_id,
    'session.scores_seeded',
    jsonb_build_object(
      'count', v_score_count,
      'tracks', to_jsonb(v_track_ids)
    )
  );

  return query select v_session_id, v_npc_ids, v_score_count;
end;
$$;

revoke all on function public.create_game_session(text, text, text, text, text) from public;
grant execute on function public.create_game_session(text, text, text, text, text) to service_role;

-- =============================================================================
-- facilitator_session_summary: read-only projection of a session for the
-- facilitator dashboard, gated on the raw facilitator token.
--
-- Returns a single composite row containing session header fields plus two
-- JSONB arrays for NPCs and score values. Empty result on token mismatch.
--
-- Callable by anon: the function is its own gate (token hash lookup). It does
-- NOT need RLS - it returns only the projection columns we explicitly select.
-- The implementer MUST NOT add `select *` to this function: leaking columns
-- here means leaking past the RLS we don't have yet.
-- =============================================================================

create or replace function public.facilitator_session_summary(
  p_facilitator_token text
)
returns table (
  game_session_id uuid,
  scenario_id text,
  title text,
  status session_status,
  current_turn int,
  current_phase phase_kind,
  phase_started_at timestamptz,
  phase_paused_at timestamptz,
  phase_duration_seconds int,
  created_at timestamptz,
  npcs jsonb,
  score_values jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_hash text;
  v_session_id uuid;
begin
  if p_facilitator_token is null or length(p_facilitator_token) < 16 then
    return;
  end if;

  v_hash := encode(digest(p_facilitator_token, 'sha256'), 'hex');

  select id into v_session_id
  from public.game_session
  where facilitator_code_hash = v_hash;

  if v_session_id is null then
    return;
  end if;

  return query
  select
    s.id,
    s.scenario_id,
    s.title,
    s.status,
    s.current_turn,
    s.current_phase,
    s.phase_started_at,
    s.phase_paused_at,
    s.phase_duration_seconds,
    s.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', p.id,
        'code', t.code,
        'display_name', p.display_name,
        'public_description', t.public_description,
        'default_controller', t.default_controller,
        'controlled_by_facilitator_id', p.controlled_by_facilitator_id
      ) order by t.code)
      from public.participant p
      join public.npc_template t on t.id = p.npc_template_id
      where p.game_session_id = s.id
        and p.participant_type = 'npc'
    ), '[]'::jsonb) as npcs,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'score_track_id', v.score_track_id,
        'track_name', t.name,
        'map_id', m.id,
        'map_name', m.name,
        'current_value', v.current_value,
        'min_value', t.min_value,
        'max_value', t.max_value,
        'visible_to_players', t.visible_to_players,
        'shared_with_map_ids', t.shared_with_map_ids,
        'track_sort_order', t.sort_order,
        'map_sort_order', m.sort_order
      ) order by m.sort_order, t.sort_order)
      from public.map_score_value v
      join public.map_score_track t on t.id = v.score_track_id
      join public.map m on m.id = t.map_id
      where v.game_session_id = s.id
    ), '[]'::jsonb) as score_values
  from public.game_session s
  where s.id = v_session_id;
end;
$$;

revoke all on function public.facilitator_session_summary(text) from public;
grant execute on function public.facilitator_session_summary(text) to anon, authenticated, service_role;

-- =============================================================================
-- Future-step interface contracts (no-op placeholders to lock in the shape).
-- =============================================================================
--
-- Step 5 - generate_role_access_tokens(p_game_session_id uuid)
--   For each role in the session's scenario, insert a row in
--   role_access_token with status='active' and a fresh hashed token + manual
--   code. Returns (role_code, token, manual_code). Called from a CLI script
--   similar to create-session; the printed output feeds badge generation.
--
-- Step 6 - issue-participant-jwt edge function (NOT in Postgres):
--   Input:  { kind: 'facilitator' | 'role_claim' | 'observer', token: string,
--             game_session_id?: uuid, device_label?: string }
--   For role_claim, the function hashes token, looks up an active
--   role_access_token, marks role as claimed, creates a participant row if
--   needed, then signs a JWT with claims:
--     { sub, game_session_id, participant_id, permission_level, role: 'authenticated' }
--   For facilitator/observer, it hashes against the matching column on
--   game_session and signs a JWT with permission_level='facilitator' /
--   'observer' (no participant_id required for observer).
--   Output: { access_token, refresh_token, participant_id }.
