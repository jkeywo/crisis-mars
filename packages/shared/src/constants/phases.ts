// Phase kinds and turn structure mirroring the SQL `phase_kind` enum in
// supabase/migrations/0001_init.sql.

export const PHASE_KINDS = ['prologue', 'team', 'negotiation', 'action', 'epilogue'] as const;

export type PhaseKind = (typeof PHASE_KINDS)[number];

export const PHASE_LABELS: Record<PhaseKind, string> = {
  prologue: 'Prologue',
  team: 'Team Phase',
  negotiation: 'Negotiation Phase',
  action: 'Action Phase',
  epilogue: 'Epilogue',
};

// Default schedule (matches the schedule embedded in the seed scenario but also
// safe to use as a fallback if the session row has not been loaded yet).
export const DEFAULT_TURN_COUNT = 4;
export const DEFAULT_TEAM_SECONDS = 5 * 60;
export const DEFAULT_NEGOTIATION_SECONDS = 5 * 60;
export const DEFAULT_ACTION_SECONDS = 10 * 60;
export const DEFAULT_PROLOGUE_SECONDS = 30 * 60;
export const DEFAULT_EPILOGUE_SECONDS = 10 * 60;
