-- 0002_rls.sql
-- Row-Level Security policies enforcing spec section 22.
--
-- Step 6 note: The JWT claim helper functions defined here (jwt_session_id,
-- jwt_participant_id, jwt_permission_level, is_facilitator, is_observer,
-- is_in_session) are REPLACED by migration 0005_claim_rls.sql which rewrites
-- them to resolve identity via the participant_session table using auth.uid()
-- rather than custom JWT claims. After 0005 is applied, the function bodies
-- from 0002 are no longer in effect. The policies themselves remain unchanged.
--
-- Original JWT claims model (now superseded):
--   game_session_id, participant_id, permission_level were expected as custom
--   claims in the JWT. Supabase free tier does not support auth hooks to inject
--   custom claims. The 0005 migration adopts Option D instead.
--

create or replace function public.jwt_session_id() returns uuid
  language sql stable as $$
    select nullif(auth.jwt() ->> 'game_session_id', '')::uuid
$$;

create or replace function public.jwt_participant_id() returns uuid
  language sql stable as $$
    select nullif(auth.jwt() ->> 'participant_id', '')::uuid
$$;

create or replace function public.jwt_permission_level() returns text
  language sql stable as $$
    select coalesce(auth.jwt() ->> 'permission_level', 'player')
$$;

create or replace function public.is_facilitator() returns boolean
  language sql stable as $$
    select public.jwt_permission_level() = 'facilitator'
$$;

create or replace function public.is_observer() returns boolean
  language sql stable as $$
    select public.jwt_permission_level() = 'observer'
$$;

create or replace function public.is_in_session(target_session uuid) returns boolean
  language sql stable as $$
    select public.jwt_session_id() = target_session
$$;

-- =============================================================================
-- Static scenario content: world-readable to any authenticated participant.
-- Faction and role public_brief/public_description fields are public; role's
-- private_brief is gated below. NPC facilitator_notes are gated likewise.
-- =============================================================================

create policy scenario_select_all on scenario for select to authenticated using (true);
create policy faction_select_all on faction for select to authenticated using (true);
create policy map_select_all on map for select to authenticated using (true);
create policy map_score_track_select_all on map_score_track for select to authenticated using (true);
create policy map_location_select_all on map_location for select to authenticated using (true);
create policy card_template_select_all on card_template for select to authenticated using (true);
create policy starting_resource_select_all on starting_resource_distribution for select to authenticated using (true);
create policy war_correspondence_select_facilitator on war_correspondence
  for select to authenticated using (public.is_facilitator());
create policy role_availability_select_all on role_availability for select to authenticated using (true);

-- =============================================================================
-- Role: private_brief and personal_goal must never leave the database except for
-- the active claimant of that role (or any facilitator). RLS cannot mask columns
-- directly, so we close the `role` table to non-facilitators entirely and expose
-- the public columns through the `role_public` view. The private brief is
-- delivered by the SECURITY DEFINER RPC `get_my_role_brief()` defined below.
-- =============================================================================

-- Players read public columns through the view; the base table is locked down.
revoke all on public.role from anon, authenticated;
grant select on public.role to service_role;

-- Facilitators can read every column of their session's roles via RLS.
create policy role_select_facilitator on role for select to authenticated
  using (public.is_facilitator());

create or replace view public.role_public
  with (security_invoker = true)
  as
  select id, scenario_id, faction_id, code, name, public_description, initiative_by_turn, sort_order
  from public.role;

-- Allow any authenticated user (or anon, for the marketing-style scenario
-- browsing case) to read the public projection. RLS on the underlying table
-- still blocks SELECT on private columns because the view runs as the caller,
-- and the columns it projects are the only ones visible.
grant select on public.role_public to authenticated, anon;

-- RPC: return the private brief and personal goal for the caller's claimed role.
-- Returns at most one row. NULL if the caller has not claimed a role in their
-- session, or if the participant_id claim does not resolve to a role.
create or replace function public.get_my_role_brief()
  returns table (
    role_id uuid,
    code text,
    name text,
    private_brief text,
    personal_goal text
  )
  language sql
  security definer
  set search_path = public
  as $$
    select r.id, r.code, r.name, r.private_brief, r.personal_goal
    from public.role r
    join public.participant p on p.role_id = r.id
    where p.id = public.jwt_participant_id()
      and p.game_session_id = public.jwt_session_id()
$$;

revoke all on function public.get_my_role_brief() from public;
grant execute on function public.get_my_role_brief() to authenticated;

-- =============================================================================
-- NPC template: public_description is world-readable to participants; the
-- facilitator_notes column is facilitator-only. Same view-plus-RLS pattern.
-- =============================================================================

revoke all on public.npc_template from anon, authenticated;
grant select on public.npc_template to service_role;

create policy npc_template_select_facilitator on npc_template for select to authenticated
  using (public.is_facilitator());

create or replace view public.npc_template_public
  with (security_invoker = true)
  as
  select id, scenario_id, code, name, default_controller, public_description
  from public.npc_template;

grant select on public.npc_template_public to authenticated, anon;

-- =============================================================================
-- Game session and participants
-- =============================================================================

create policy game_session_select_member on game_session for select to authenticated
  using (
    public.is_in_session(id)
    or public.is_facilitator()
  );

-- Mutation of game_session goes through service role only; no insert/update/delete policies for authenticated.

create policy participant_select_session on participant for select to authenticated
  using (public.is_in_session(game_session_id));

-- A player can update only their own row (e.g. set display name during claim, last_seen_at).
create policy participant_update_self on participant for update to authenticated
  using (
    public.is_in_session(game_session_id)
    and (id = public.jwt_participant_id() or public.is_facilitator())
  )
  with check (
    public.is_in_session(game_session_id)
    and (id = public.jwt_participant_id() or public.is_facilitator())
  );

create policy participant_session_select_self on participant_session for select to authenticated
  using (
    participant_id = public.jwt_participant_id()
    or public.is_facilitator()
  );

-- role_access_token: facilitators only. Never expose token_hash or manual_code_hash
-- to players. The application should read via a SECURITY DEFINER RPC.
create policy role_access_token_facilitator_only on role_access_token for select to authenticated
  using (public.is_facilitator());

-- =============================================================================
-- Scores: any participant of the session may read; only facilitators may write.
-- =============================================================================

create policy map_score_value_select_session on map_score_value for select to authenticated
  using (public.is_in_session(game_session_id));

create policy map_score_value_update_facilitator on map_score_value for update to authenticated
  using (public.is_in_session(game_session_id) and public.is_facilitator())
  with check (public.is_in_session(game_session_id) and public.is_facilitator());

create policy map_score_value_insert_facilitator on map_score_value for insert to authenticated
  with check (public.is_in_session(game_session_id) and public.is_facilitator());

-- =============================================================================
-- Cards
--   * A participant can see a card if they are its current holder OR original owner.
--   * Facilitators can see every card in their session.
--   * All writes go through SECURITY DEFINER RPCs (loan, recall, reclaim, etc.).
-- =============================================================================

create policy card_instance_select_holder_or_owner on card_instance for select to authenticated
  using (
    public.is_in_session(game_session_id)
    and (
      current_holder_participant_id = public.jwt_participant_id()
      or original_owner_participant_id = public.jwt_participant_id()
      or public.is_facilitator()
    )
  );

-- =============================================================================
-- Per-turn state: visible only to the participant and facilitators.
-- =============================================================================

create policy participant_turn_state_select on participant_turn_state for select to authenticated
  using (
    public.is_in_session(game_session_id)
    and (participant_id = public.jwt_participant_id() or public.is_facilitator())
  );

-- =============================================================================
-- Actions
--   * action_submission is visible to the acting participant and facilitators.
--     During Action Phase, the facilitator dashboard joins on map_id to build queues.
--   * action_resolution is facilitator-only until resolved; once resolved, the
--     acting player can read their own row.
-- =============================================================================

create policy action_submission_select on action_submission for select to authenticated
  using (
    public.is_in_session(game_session_id)
    and (participant_id = public.jwt_participant_id() or public.is_facilitator())
  );

create policy action_resolution_select on action_resolution for select to authenticated
  using (
    exists (
      select 1
      from action_submission s
      where s.id = action_resolution.action_submission_id
        and public.is_in_session(s.game_session_id)
        and (
          s.participant_id = public.jwt_participant_id()
          or public.is_facilitator()
        )
    )
  );

-- =============================================================================
-- Opportunities: facilitators see all; players see only opportunities offered to
-- their faction or to themselves (when status >= 'offered').
-- =============================================================================

create policy opportunity_select_facilitator on opportunity for select to authenticated
  using (public.is_in_session(game_session_id) and public.is_facilitator());

create policy opportunity_select_recipient on opportunity for select to authenticated
  using (
    public.is_in_session(game_session_id)
    and status <> 'pending'
    and (
      recipient_faction_id in (
        select faction_id from participant where id = public.jwt_participant_id()
      )
      or recipient_npc_participant_id = public.jwt_participant_id()
    )
  );

-- =============================================================================
-- Trades: visible to the two participants involved and facilitators.
-- =============================================================================

create policy trade_event_select on trade_event for select to authenticated
  using (
    public.is_in_session(game_session_id)
    and (
      from_participant_id = public.jwt_participant_id()
      or to_participant_id = public.jwt_participant_id()
      or public.is_facilitator()
    )
  );

create policy trade_item_select on trade_item for select to authenticated
  using (
    exists (
      select 1
      from trade_event t
      where t.id = trade_item.trade_event_id
        and public.is_in_session(t.game_session_id)
        and (
          t.from_participant_id = public.jwt_participant_id()
          or t.to_participant_id = public.jwt_participant_id()
          or public.is_facilitator()
        )
    )
  );

-- =============================================================================
-- Audit logs: facilitators only. Card audit events visible to holder/owner of the
-- card are intentionally NOT exposed - players see player-friendly alerts instead.
-- =============================================================================

create policy audit_event_facilitator_only on audit_event for select to authenticated
  using (public.is_in_session(game_session_id) and public.is_facilitator());

create policy card_audit_event_facilitator_only on card_audit_event for select to authenticated
  using (public.is_in_session(game_session_id) and public.is_facilitator());
