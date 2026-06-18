// API response shapes for SECURITY DEFINER RPCs exposed via PostgREST.
// Hand-typed projections; these mirror the `returns table (...)` of the
// matching functions in supabase/migrations/0003_functions.sql and
// 0004_badges.sql. Keep in sync when SQL is modified.

import type { PhaseKind } from '../constants/phases';
import type { NpcController } from './scenario';

// =============================================================================
// Step 4 - facilitator_session_summary
// =============================================================================

export type SessionStatus = 'draft' | 'live' | 'paused' | 'ended' | 'archived';

export interface FacilitatorSummaryNpc {
  participant_id: string;
  code: string;
  display_name: string;
  public_description: string;
  default_controller: NpcController;
  controlled_by_facilitator_id: string | null;
}

export interface FacilitatorSummaryScoreValue {
  score_track_id: string;
  track_name: string;
  map_id: string;
  map_name: string;
  current_value: number;
  min_value: number;
  max_value: number;
  visible_to_players: boolean;
  shared_with_map_ids: string[];
  track_sort_order: number;
  map_sort_order: number;
}

// =============================================================================
// Step 5 - role badge status in facilitator_session_summary
// =============================================================================

/** One row per role in the session's scenario. token_hash is never included. */
export interface FacilitatorSummaryRoleBadge {
  role_id: string;
  role_code: string;
  role_name: string;
  faction_id: string;
  faction_name: string;
  sort_order: number;
  /** True when an active role_access_token row exists for this (session, role). */
  badge_generated: boolean;
  /** Null until the player claims the role (step 6). */
  claimed_by: string | null;
  /** Null until the player claims the role (step 6). */
  claimed_at: string | null;
}

export interface FacilitatorSummary {
  game_session_id: string;
  scenario_id: string;
  title: string;
  status: SessionStatus;
  current_turn: number;
  current_phase: PhaseKind;
  phase_started_at: string;
  /** Set when status='paused'. UI should compute elapsed using this as the freeze point. */
  phase_paused_at: string | null;
  phase_duration_seconds: number | null;
  created_at: string;
  npcs: FacilitatorSummaryNpc[];
  score_values: FacilitatorSummaryScoreValue[];
  /** Added in step 5. Badge generation and claim status per role. Optional
   * because sessions created before migration 0004 was applied will return
   * undefined for this column until `db:reset` is re-run. */
  role_badges?: FacilitatorSummaryRoleBadge[];
}
