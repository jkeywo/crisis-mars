// API response shapes for SECURITY DEFINER RPCs exposed via PostgREST.
// Hand-typed projections; these mirror the `returns table (...)` of the
// matching function in supabase/migrations/0003_functions.sql. Keep in sync.

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
}
