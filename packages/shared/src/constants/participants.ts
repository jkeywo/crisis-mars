// Participant types and permission levels mirroring the SQL enums in
// supabase/migrations/0001_init.sql.

export const PARTICIPANT_TYPES = ['player', 'facilitator', 'npc', 'observer'] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export const PERMISSION_LEVELS = ['player', 'facilitator', 'observer'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];
