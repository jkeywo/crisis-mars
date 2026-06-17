// Domain types derived from the scenario JSON shape. Mirrors scenario/schema.json.
// Hand-maintained: when adding fields, update both the schema and these types.

import type { CardType } from '../constants/cards';

export interface ScenarioSetting {
  intro: string;
  locations: string;
  factions_overview: string;
}

export interface ScenarioTurn {
  number: number;
  team_seconds: number;
  negotiation_seconds: number;
  action_seconds: number;
}

export interface ScenarioSchedule {
  prologue_seconds: number;
  epilogue_seconds: number;
  turns: ScenarioTurn[];
}

export interface ScenarioFaction {
  id: string;
  name: string;
  short_name: string;
  colour: string;
  icon_url?: string;
  icon_small_url?: string;
  icon_colour_url?: string;
  public_brief: string;
  common_goals: string[];
  sort_order: number;
}

export interface ScenarioRoleAvailability {
  player_count: number;
  is_recommended: boolean;
}

export interface ScenarioRole {
  code: string;
  name: string;
  faction_id: string;
  public_description: string;
  private_brief: string;
  personal_goal: string;
  initiative_by_turn: number[];
  availability: ScenarioRoleAvailability[];
  sort_order: number;
}

export type NpcController = 'earth_control' | 'mars_control' | 'belt_control';

export interface ScenarioNpc {
  code: string;
  name: string;
  default_controller: NpcController;
  public_description: string;
  facilitator_notes: string;
}

export interface ScenarioScoreTrack {
  id: string;
  name: string;
  description?: string;
  min_value: number;
  max_value: number;
  starting_value: number;
  visible_to_players: boolean;
  /**
   * Map ids on which this track should also display, beyond the map it is
   * defined on. Used for shared tracks like War Progress (spec section 13.5).
   */
  shared_with_map_ids?: string[];
  sort_order: number;
}

export interface ScenarioMapLocation {
  id: string;
  name: string;
  description?: string;
  valid_for_actions: boolean;
  sort_order: number;
}

export interface ScenarioMap {
  id: string;
  name: string;
  image_url?: string;
  sort_order: number;
  score_tracks: ScenarioScoreTrack[];
  locations: ScenarioMapLocation[];
}

export interface ScenarioCardTemplate {
  id: string;
  card_type: CardType;
  name: string;
  faction_id?: string | null;
  owner_role_code?: string | null;
  rules_text?: string;
  flavour_text?: string;
  impact_bonus?: number;
  tradeable: boolean;
  reclaimable: boolean;
}

export interface ScenarioStartingResourceEntry {
  role_code: string;
  resource_template_id: string;
  count: number;
}

export interface ScenarioWarCorrespondenceEffect {
  description: string;
  score_track_id?: string;
  delta?: number;
}

export interface ScenarioWarCorrespondence {
  turn: number;
  title: string;
  public_text: string;
  facilitator_notes?: string;
  suggested_effects?: ScenarioWarCorrespondenceEffect[];
}

export interface Scenario {
  id: string;
  name: string;
  version: string;
  description: string;
  default_player_count_min: number;
  default_player_count_max: number;
  setting?: ScenarioSetting;
  schedule: ScenarioSchedule;
  factions: ScenarioFaction[];
  roles: ScenarioRole[];
  npcs: ScenarioNpc[];
  maps: ScenarioMap[];
  card_templates: ScenarioCardTemplate[];
  starting_resource_distribution?: ScenarioStartingResourceEntry[];
  war_correspondence: ScenarioWarCorrespondence[];
}
