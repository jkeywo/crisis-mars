-- 0006_claim_functions.sql
-- Step 6: role claim and rejoin SECURITY DEFINER RPCs.
--
-- Functions:
--   preview_role_claim(p_game_token, p_role_token) → public info + claim status.
--     Callable by anon. Used by the claim page before the player authenticates.
--
--   check_my_session(p_game_token, p_role_token) → whether the calling anon UID
--     already has a participant_session row for this role.
--     Callable by authenticated only.
--
--   claim_role(p_game_token, p_role_token, p_display_name, p_device_label)
--     → inserts participant + participant_session, writes audit_event.
--     Callable by authenticated only.
--
--   restore_role(p_game_token, p_role_token, p_device_label)
--     → inserts a new participant_session for the existing participant.
--     Callable by authenticated only.
--
-- Error code conventions:
--   P0001  bad input (missing required field)
--   P0002  not found / not applicable (token invalid, session inactive, etc.)
--   P0003  locked (role or token is explicitly locked by facilitator)
--   P0004  already claimed (use restore_role instead)

-- =============================================================================
-- preview_role_claim
-- Callable by anon. Returns ONLY public information.
-- Never returns private_brief, card state, or hidden facilitator data.
-- =============================================================================

create or replace function public.preview_role_claim(
  p_game_token text,
  p_role_token text
)
returns table (
  game_session_id  uuid,
  role_id          uuid,
  role_code        text,
  role_name        text,
  faction_id       text,
  faction_name     text,
  faction_colour   text,
  public_description text,
  is_claimed       boolean,
  is_locked        boolean,
  token_status     text,
  claimed_by_name  text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_session_id   uuid;
  v_rat_row      record;
  v_role         record;
  v_faction      record;
  v_participant  record;
begin
  if p_game_token is null or length(p_game_token) < 16 then return; end if;
  if p_role_token is null or length(p_role_token) < 16 then return; end if;

  -- Resolve game session by join token hash.
  select id into v_session_id
  from public.game_session
  where join_code_hash = encode(digest(p_game_token, 'sha256'), 'hex')
    and status in ('live', 'paused');

  if v_session_id is null then return; end if;

  -- Resolve role by role badge token hash.
  select rat.role_id, rat.status as token_status
  into v_rat_row
  from public.role_access_token rat
  where rat.token_hash = encode(digest(p_role_token, 'sha256'), 'hex')
    and rat.game_session_id = v_session_id;

  if v_rat_row is null then return; end if;

  -- Public role info.
  select r.id, r.code, r.name, r.faction_id, r.public_description
  into v_role
  from public.role r where r.id = v_rat_row.role_id;

  if v_role is null then return; end if;

  select f.id, f.name, f.colour
  into v_faction
  from public.faction f where f.id = v_role.faction_id;

  -- Check claim status: is a participant row already bound to this role in this session?
  -- is_role_locked lives on participant once claimed; before claim, use token status.
  select p.display_name, p.is_role_locked
  into v_participant
  from public.participant p
  where p.game_session_id = v_session_id and p.role_id = v_rat_row.role_id;

  return query
  select
    v_session_id,
    v_role.id,
    v_role.code::text,
    v_role.name::text,
    v_role.faction_id::text,
    v_faction.name::text,
    v_faction.colour::text,
    v_role.public_description::text,
    v_participant.display_name is not null,
    coalesce(v_participant.is_role_locked, v_rat_row.token_status = 'locked'),
    v_rat_row.token_status::text,
    v_participant.display_name;
end;
$$;

revoke all on function public.preview_role_claim(text, text) from public;
grant execute on function public.preview_role_claim(text, text) to anon, authenticated, service_role;

-- =============================================================================
-- check_my_session
-- Callable by authenticated. Answers: does the calling anon UID already have
-- a non-revoked participant_session for this role in this session?
-- =============================================================================

create or replace function public.check_my_session(
  p_game_token text,
  p_role_token text
)
returns table (
  already_mine    boolean,
  participant_id  uuid,
  game_session_id uuid,
  role_id         uuid,
  role_code       text,
  role_name       text,
  faction_id      text,
  faction_name    text,
  faction_colour  text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_session_id  uuid;
  v_role_id     uuid;
  v_participant uuid;
  v_ps_id       uuid;
  v_role        record;
  v_faction     record;
begin
  if p_game_token is null or p_role_token is null then return; end if;

  select id into v_session_id
  from public.game_session
  where join_code_hash = encode(digest(p_game_token, 'sha256'), 'hex')
    and status in ('live', 'paused');
  if v_session_id is null then return; end if;

  select rat.role_id into v_role_id
  from public.role_access_token rat
  where rat.token_hash = encode(digest(p_role_token, 'sha256'), 'hex')
    and rat.game_session_id = v_session_id
    and rat.status = 'active';
  if v_role_id is null then return; end if;

  -- Find the participant for this role.
  select p.id into v_participant
  from public.participant p
  where p.game_session_id = v_session_id and p.role_id = v_role_id;

  -- Check if this anon UID already has a session for that participant.
  if v_participant is not null then
    select id into v_ps_id
    from public.participant_session ps
    where ps.participant_id = v_participant
      and ps.supabase_uid = auth.uid()
      and ps.revoked_at is null;
  end if;

  select r.id, r.code, r.name, r.faction_id, r.public_description
  into v_role
  from public.role r where r.id = v_role_id;

  select f.id, f.name, f.colour
  into v_faction
  from public.faction f where f.id = v_role.faction_id;

  return query
  select
    v_ps_id is not null,
    v_participant,
    v_session_id,
    v_role_id,
    v_role.code::text,
    v_role.name::text,
    v_role.faction_id::text,
    v_faction.name::text,
    v_faction.colour::text;
end;
$$;

revoke all on function public.check_my_session(text, text) from public;
grant execute on function public.check_my_session(text, text) to authenticated, service_role;

-- =============================================================================
-- claim_role
-- Callable by authenticated (anon sign-in must have happened first).
-- Inserts participant + participant_session; writes audit event.
-- Error codes:
--   P0001 display_name required
--   P0002 session_not_found | token_not_found | token_not_active
--   P0003 role_locked
--   P0004 role_already_claimed (caller should use restore_role instead)
-- =============================================================================

create or replace function public.claim_role(
  p_game_token   text,
  p_role_token   text,
  p_display_name text,
  p_device_label text default null
)
returns table (
  participant_id   uuid,
  game_session_id  uuid,
  role_id          uuid,
  faction_id       text,
  role_code        text,
  role_name        text,
  faction_name     text,
  permission_level text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id   uuid;
  v_role_id      uuid;
  v_token_status token_status;
  v_faction_id   text;
  v_participant  uuid;
  v_ps_id        uuid;
  v_now          timestamptz := now();
begin
  -- Validate inputs.
  if p_display_name is null or trim(p_display_name) = '' then
    raise exception 'display_name_required' using errcode = 'P0001';
  end if;
  if p_game_token is null or length(p_game_token) < 16 then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if p_role_token is null or length(p_role_token) < 16 then
    raise exception 'token_not_found' using errcode = 'P0002';
  end if;

  -- Resolve session.
  select id into v_session_id
  from public.game_session
  where join_code_hash = encode(digest(p_game_token, 'sha256'), 'hex')
    and status in ('live', 'paused');
  if v_session_id is null then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- Resolve role badge token.
  select rat.role_id, rat.status
  into v_role_id, v_token_status
  from public.role_access_token rat
  where rat.token_hash = encode(digest(p_role_token, 'sha256'), 'hex')
    and rat.game_session_id = v_session_id;
  if v_role_id is null then
    raise exception 'token_not_found' using errcode = 'P0002';
  end if;
  if v_token_status = 'locked' then
    raise exception 'role_locked' using errcode = 'P0003';
  end if;
  if v_token_status <> 'active' then
    raise exception 'token_not_active' using errcode = 'P0002';
  end if;

  -- Get faction for the constraint check.
  select r.faction_id into v_faction_id
  from public.role r where r.id = v_role_id;

  -- Guard: already claimed by someone.
  if exists (
    select 1 from public.participant p
    where p.game_session_id = v_session_id and p.role_id = v_role_id
  ) then
    raise exception 'role_already_claimed' using errcode = 'P0004';
  end if;

  -- Guard: this anon UID already has a session (shouldn't happen if client
  -- calls check_my_session first, but belt-and-suspenders).
  if exists (
    select 1 from public.participant_session ps
    join public.participant p on p.id = ps.participant_id
    where ps.supabase_uid = auth.uid()
      and p.game_session_id = v_session_id
      and ps.revoked_at is null
  ) then
    raise exception 'already_in_session' using errcode = 'P0004';
  end if;

  -- Guard: this anon UID must not belong to a DIFFERENT game session.
  -- This prevents the LIMIT 1 ambiguity in the RLS helper functions:
  -- jwt_session_id() returns LIMIT 1; if one UID spans sessions the helpers
  -- would return the wrong session for one of them. In the MVP a player uses one
  -- browser per game session — joining a second session on the same UID would
  -- break RLS. Future multi-session support would require named session contexts.
  if exists (
    select 1
    from public.participant_session ps
    join public.participant p on p.id = ps.participant_id
    where ps.supabase_uid = auth.uid()
      and p.game_session_id <> v_session_id
      and ps.revoked_at is null
  ) then
    raise exception 'uid_already_in_different_session: use a fresh browser profile to join a second session'
      using errcode = 'P0005';
  end if;

  -- Insert participant row.
  insert into public.participant (
    game_session_id,
    display_name,
    participant_type,
    role_id,
    faction_id,
    permission_level,
    role_claimed_at,
    role_claimed_by_name,
    active_device_count,
    is_role_locked,
    last_seen_at
  ) values (
    v_session_id,
    trim(p_display_name),
    'player',
    v_role_id,
    v_faction_id,
    'player',
    v_now,
    trim(p_display_name),
    1,
    false,
    v_now
  ) returning id into v_participant;

  -- Insert participant_session row, binding this anon UID to the participant.
  insert into public.participant_session (
    participant_id,
    game_session_id,
    supabase_uid,
    device_label,
    created_at,
    last_seen_at
  ) values (
    v_participant,
    v_session_id,
    auth.uid(),
    p_device_label,
    v_now,
    v_now
  ) returning id into v_ps_id;

  -- Audit event.
  insert into public.audit_event (game_session_id, actor_participant_id, event_type, event_payload_json)
  values (
    v_session_id,
    v_participant,
    'role.claimed',
    jsonb_build_object(
      'role_id', v_role_id,
      'display_name', trim(p_display_name),
      'participant_session_id', v_ps_id,
      'device_label', p_device_label
    )
  );

  -- Return.
  return query
  select
    v_participant,
    v_session_id,
    v_role_id,
    v_faction_id::text,
    r.code::text,
    r.name::text,
    f.name::text,
    'player'::text
  from public.role r
  join public.faction f on f.id = r.faction_id
  where r.id = v_role_id;
end;
$$;

revoke all on function public.claim_role(text, text, text, text) from public;
grant execute on function public.claim_role(text, text, text, text) to authenticated, service_role;

-- =============================================================================
-- restore_role
-- Callable by authenticated.
-- Adds a new participant_session for an existing participant (new device).
-- =============================================================================

create or replace function public.restore_role(
  p_game_token   text,
  p_role_token   text,
  p_device_label text default null
)
returns table (
  participant_id   uuid,
  game_session_id  uuid,
  role_id          uuid,
  faction_id       text,
  role_code        text,
  role_name        text,
  faction_name     text,
  permission_level text,
  display_name     text,
  active_device_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id    uuid;
  v_role_id       uuid;
  v_token_status  token_status;
  v_participant   uuid;
  v_prev_count    int;
  v_ps_id         uuid;
  v_now           timestamptz := now();
begin
  -- Token validation (same as claim_role).
  if p_game_token is null or length(p_game_token) < 16 then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if p_role_token is null or length(p_role_token) < 16 then
    raise exception 'token_not_found' using errcode = 'P0002';
  end if;

  select id into v_session_id
  from public.game_session
  where join_code_hash = encode(digest(p_game_token, 'sha256'), 'hex')
    and status in ('live', 'paused');
  if v_session_id is null then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  select rat.role_id, rat.status
  into v_role_id, v_token_status
  from public.role_access_token rat
  where rat.token_hash = encode(digest(p_role_token, 'sha256'), 'hex')
    and rat.game_session_id = v_session_id;
  if v_role_id is null then
    raise exception 'token_not_found' using errcode = 'P0002';
  end if;
  if v_token_status = 'locked' then
    raise exception 'role_locked' using errcode = 'P0003';
  end if;
  if v_token_status <> 'active' then
    raise exception 'token_not_active' using errcode = 'P0002';
  end if;

  -- Participant must exist (role already claimed).
  select p.id, p.active_device_count
  into v_participant, v_prev_count
  from public.participant p
  where p.game_session_id = v_session_id and p.role_id = v_role_id;
  if v_participant is null then
    raise exception 'role_not_yet_claimed' using errcode = 'P0002';
  end if;

  -- Insert new participant_session for this device/UID.
  insert into public.participant_session (
    participant_id,
    game_session_id,
    supabase_uid,
    device_label,
    created_at,
    last_seen_at
  ) values (
    v_participant,
    v_session_id,
    auth.uid(),
    p_device_label,
    v_now,
    v_now
  ) returning id into v_ps_id;

  -- Increment active_device_count.
  update public.participant
  set active_device_count = active_device_count + 1,
      last_restored_at    = v_now,
      last_seen_at        = v_now
  where id = v_participant;

  -- Audit multi-device event when this isn't the first device.
  if v_prev_count >= 1 then
    insert into public.audit_event (game_session_id, actor_participant_id, event_type, event_payload_json)
    values (
      v_session_id,
      v_participant,
      'role.multi_device',
      jsonb_build_object(
        'new_participant_session_id', v_ps_id,
        'active_device_count', v_prev_count + 1,
        'device_label', p_device_label
      )
    );
  end if;

  -- Audit restore event.
  insert into public.audit_event (game_session_id, actor_participant_id, event_type, event_payload_json)
  values (
    v_session_id,
    v_participant,
    'role.restored',
    jsonb_build_object(
      'participant_session_id', v_ps_id,
      'device_label', p_device_label,
      'active_device_count', v_prev_count + 1
    )
  );

  return query
  select
    v_participant,
    v_session_id,
    v_role_id,
    r.faction_id::text,
    r.code::text,
    r.name::text,
    f.name::text,
    'player'::text,
    p.display_name::text,
    p.active_device_count
  from public.role r
  join public.faction f on f.id = r.faction_id
  join public.participant p on p.id = v_participant
  where r.id = v_role_id;
end;
$$;

revoke all on function public.restore_role(text, text, text) from public;
grant execute on function public.restore_role(text, text, text) to authenticated, service_role;

-- =============================================================================
-- Extend facilitator_session_summary with active_device_count per role
-- (needed for multi-device warning in the dashboard, step 5/commit 5 concern)
-- The function is recreated with the full body; role_badges now includes
-- active_device_count from the participant row.
-- =============================================================================

create or replace function public.facilitator_session_summary(
  p_facilitator_token text
)
returns table (
  game_session_id        uuid,
  scenario_id            text,
  title                  text,
  status                 session_status,
  current_turn           int,
  current_phase          phase_kind,
  phase_started_at       timestamptz,
  phase_paused_at        timestamptz,
  phase_duration_seconds int,
  created_at             timestamptz,
  npcs                   jsonb,
  score_values           jsonb,
  role_badges            jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_hash       text;
  v_session_id uuid;
begin
  if p_facilitator_token is null or length(p_facilitator_token) < 16 then return; end if;

  v_hash := encode(digest(p_facilitator_token, 'sha256'), 'hex');

  select id into v_session_id
  from public.game_session
  where facilitator_code_hash = v_hash;

  if v_session_id is null then return; end if;

  return query
  select
    s.id, s.scenario_id, s.title, s.status, s.current_turn, s.current_phase,
    s.phase_started_at, s.phase_paused_at, s.phase_duration_seconds, s.created_at,
    -- NPCs
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', p.id, 'code', nt.code, 'display_name', p.display_name,
        'public_description', nt.public_description,
        'default_controller', nt.default_controller,
        'controlled_by_facilitator_id', p.controlled_by_facilitator_id
      ) order by nt.code)
      from public.participant p
      join public.npc_template nt on nt.id = p.npc_template_id
      where p.game_session_id = s.id and p.participant_type = 'npc'
    ), '[]'::jsonb),
    -- Score values
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'score_track_id', v.score_track_id, 'track_name', t.name,
        'map_id', m.id, 'map_name', m.name, 'current_value', v.current_value,
        'min_value', t.min_value, 'max_value', t.max_value,
        'visible_to_players', t.visible_to_players,
        'shared_with_map_ids', t.shared_with_map_ids,
        'track_sort_order', t.sort_order, 'map_sort_order', m.sort_order
      ) order by m.sort_order, t.sort_order)
      from public.map_score_value v
      join public.map_score_track t on t.id = v.score_track_id
      join public.map m on m.id = t.map_id
      where v.game_session_id = s.id
    ), '[]'::jsonb),
    -- Role badges with active_device_count added for multi-device warning
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_id', r.id, 'role_code', r.code, 'role_name', r.name,
        'faction_id', r.faction_id, 'faction_name', f.name,
        'sort_order', r.sort_order,
        'badge_generated', exists(
          select 1 from public.role_access_token rat
          where rat.game_session_id = s.id and rat.role_id = r.id and rat.status = 'active'
        ),
        'claimed_by', p.role_claimed_by_name,
        'claimed_at', p.role_claimed_at,
        'active_device_count', coalesce(p.active_device_count, 0)
      ) order by r.sort_order)
      from public.role r
      join public.faction f on f.id = r.faction_id
      left join public.participant p
        on p.game_session_id = s.id and p.role_id = r.id
      where f.scenario_id = s.scenario_id
    ), '[]'::jsonb)
  from public.game_session s
  where s.id = v_session_id;
end;
$$;

revoke all on function public.facilitator_session_summary(text) from public;
-- Grant anon so the facilitator dashboard can call this before authenticating.
-- The function is its own security gate: it hashes the token, looks up the session,
-- and returns empty on mismatch. No sensitive data leaks to a caller without the token.
grant execute on function public.facilitator_session_summary(text) to anon, authenticated, service_role;
