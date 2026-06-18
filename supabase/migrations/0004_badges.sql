-- 0004_badges.sql
-- Step 5: Printable role badge QR generation.
--
-- Adds:
--   1. generate_role_access_tokens(p_game_session_id, p_role_ids, p_role_tokens, p_manual_codes)
--      Mints one role_access_token per role for the session, rotating any existing
--      active token first. Callable by service_role only.
--      p_role_ids: optional filter (NULL = all roles for the session's scenario).
--
--   2. Extension to facilitator_session_summary (recreated with role_badges column)
--      showing badge generation and claim status per role.

-- =============================================================================
-- 1. generate_role_access_tokens
-- =============================================================================

create or replace function public.generate_role_access_tokens(
  p_game_session_id uuid,
  p_role_ids        uuid[],   -- NULL = all roles for the session's scenario
  p_role_tokens     text[],   -- raw badge tokens, parallel with p_role_ids / all roles
  p_manual_codes    text[]    -- raw manual codes, same order
)
returns table (
  role_id       uuid,
  role_code     text,
  role_name     text,
  faction_id    text,
  token         text,
  manual_code   text,
  token_rotated boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scenario_id      text;
  v_roles            public.role[];
  v_role_count       int;
  v_now              timestamptz := now();
  v_role             public.role;
  v_idx              int;
  v_rotated_count    int;
  v_was_rotated      boolean;
begin
  -- Validate session.
  select gs.scenario_id into v_scenario_id
  from public.game_session gs
  where gs.id = p_game_session_id;

  if not found then
    raise exception 'game_session % does not exist', p_game_session_id using errcode = 'P0001';
  end if;

  -- Collect target roles ordered by sort_order.
  -- If p_role_ids is supplied, restrict to only those roles; otherwise take all.
  if p_role_ids is null or array_length(p_role_ids, 1) is null then
    select array_agg(r order by r.sort_order) into v_roles
    from public.role r
    join public.faction f on f.id = r.faction_id
    where f.scenario_id = v_scenario_id;
  else
    select array_agg(r order by r.sort_order) into v_roles
    from public.role r
    join public.faction f on f.id = r.faction_id
    where f.scenario_id = v_scenario_id
      and r.id = any(p_role_ids);
  end if;

  v_role_count := coalesce(array_length(v_roles, 1), 0);

  if v_role_count = 0 then
    raise exception 'no matching roles found for scenario %', v_scenario_id using errcode = 'P0001';
  end if;

  if array_length(p_role_tokens, 1) <> v_role_count then
    raise exception 'p_role_tokens length (%) must equal role count (%)',
      coalesce(array_length(p_role_tokens, 1), 0), v_role_count
      using errcode = 'P0001';
  end if;

  if array_length(p_manual_codes, 1) <> v_role_count then
    raise exception 'p_manual_codes length (%) must equal role count (%)',
      coalesce(array_length(p_manual_codes, 1), 0), v_role_count
      using errcode = 'P0001';
  end if;

  -- Per role: validate, rotate any existing active token, insert new active token.
  for v_idx in 1..v_role_count loop
    if p_role_tokens[v_idx] is null or length(p_role_tokens[v_idx]) < 16 then
      raise exception 'p_role_tokens[%] is too short (minimum 16 chars)', v_idx using errcode = 'P0001';
    end if;
    if p_manual_codes[v_idx] is null or length(p_manual_codes[v_idx]) < 4 then
      raise exception 'p_manual_codes[%] is too short (minimum 4 chars)', v_idx using errcode = 'P0001';
    end if;

    v_role := v_roles[v_idx];

    -- Rotate any existing active token. Use GET DIAGNOSTICS to detect if
    -- rotation actually occurred (needed for the accurate audit payload).
    update public.role_access_token
    set
      status     = 'rotated',
      rotated_at = v_now
    where game_session_id = p_game_session_id
      and role_id         = v_role.id
      and status          = 'active';

    get diagnostics v_rotated_count = row_count;
    v_was_rotated := v_rotated_count > 0;

    -- Insert fresh active token.
    insert into public.role_access_token (
      game_session_id,
      role_id,
      token_hash,
      manual_code_hash,
      status,
      created_at
    )
    values (
      p_game_session_id,
      v_role.id,
      encode(digest(p_role_tokens[v_idx], 'sha256'), 'hex'),
      encode(digest(p_manual_codes[v_idx], 'sha256'), 'hex'),
      'active',
      v_now
    );

    -- Audit event with accurate rotation flag.
    insert into public.audit_event (game_session_id, event_type, event_payload_json)
    values (
      p_game_session_id,
      'badges.generated',
      jsonb_build_object(
        'role_id',      v_role.id,
        'role_code',    v_role.code,
        'token_rotated', v_was_rotated
      )
    );

    -- Echo raw token and rotation status back to the caller so the script can
    -- build QR URLs and conditional warnings without a second round-trip.
    return query
    select
      v_role.id,
      v_role.code::text,
      v_role.name::text,
      v_role.faction_id::text,
      p_role_tokens[v_idx],
      p_manual_codes[v_idx],
      v_was_rotated;

  end loop;
end;
$$;

revoke all on function public.generate_role_access_tokens(uuid, uuid[], text[], text[]) from public;
grant execute on function public.generate_role_access_tokens(uuid, uuid[], text[], text[]) to service_role;

-- =============================================================================
-- 2. Extend facilitator_session_summary with role_badges
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
    -- NPCs
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id',               p.id,
        'code',                         nt.code,
        'display_name',                 p.display_name,
        'public_description',           nt.public_description,
        'default_controller',           nt.default_controller,
        'controlled_by_facilitator_id', p.controlled_by_facilitator_id
      ) order by nt.code)
      from public.participant p
      join public.npc_template nt on nt.id = p.npc_template_id
      where p.game_session_id = s.id
        and p.participant_type = 'npc'
    ), '[]'::jsonb),
    -- Score values
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'score_track_id',     v.score_track_id,
        'track_name',         t.name,
        'map_id',             m.id,
        'map_name',           m.name,
        'current_value',      v.current_value,
        'min_value',          t.min_value,
        'max_value',          t.max_value,
        'visible_to_players', t.visible_to_players,
        'shared_with_map_ids', t.shared_with_map_ids,
        'track_sort_order',   t.sort_order,
        'map_sort_order',     m.sort_order
      ) order by m.sort_order, t.sort_order)
      from public.map_score_value v
      join public.map_score_track t on t.id = v.score_track_id
      join public.map m on m.id = t.map_id
      where v.game_session_id = s.id
    ), '[]'::jsonb),
    -- Role badges: generation + claim status per role, scoped to this session's scenario.
    -- NOTE: token_hash and manual_code_hash are NOT included — never expose hashes to clients.
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_id',         r.id,
        'role_code',       r.code,
        'role_name',       r.name,
        'faction_id',      r.faction_id,
        'faction_name',    f.name,
        'sort_order',      r.sort_order,
        'badge_generated', exists(
          select 1 from public.role_access_token rat
          where rat.game_session_id = s.id
            and rat.role_id = r.id
            and rat.status = 'active'
        ),
        'claimed_by',  p.role_claimed_by_name,
        'claimed_at',  p.role_claimed_at
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
grant execute on function public.facilitator_session_summary(text) to anon, authenticated, service_role;
