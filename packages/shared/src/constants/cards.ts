// Card states mirroring the SQL `card_state` enum in
// supabase/migrations/0001_init.sql. Keep in sync.

export const CARD_STATES = [
  'held',
  'offered',
  'committed',
  'accepted',
  'rejected',
  'spent',
  'reclaimed',
  'voided',
] as const;

export type CardState = (typeof CARD_STATES)[number];

export const CARD_TYPES = ['action', 'resource'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const ACTION_STATUSES = [
  'in_hand',
  'placed',
  'called',
  'resolving',
  'resolved',
  'returned',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
