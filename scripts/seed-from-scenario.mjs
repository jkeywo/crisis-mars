#!/usr/bin/env node
// Idempotently load scenario/crisis-mars-v1.json into the running Supabase database.
// Uses the SERVICE ROLE key, which bypasses RLS - never ship this script in client builds.
//
// Strategy:
//   * Upsert the scenario row by id.
//   * Replace all child rows (factions, roles, role_availability, npc_template, map,
//     map_score_track, map_location, card_template, starting_resource_distribution,
//     war_correspondence) for that scenario_id. We use delete-then-insert because
//     these tables are small and rebuilding them cleanly is simpler than diffing.
//
// Requires env vars:
//   PUBLIC_SUPABASE_URL          e.g. http://127.0.0.1:54321
//   SUPABASE_SERVICE_ROLE_KEY    printed by `supabase status` for local dev.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
loadEnv({ path: resolve(root, '.env') });

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const scenarioPath = resolve(root, 'scenario/crisis-mars-v1.json');
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const scenarioId = scenario.id;

async function run() {
  console.log(`Seeding scenario "${scenarioId}" (${scenario.name} v${scenario.version})...`);

  // 1. Scenario row
  {
    const { error } = await supabase.from('scenario').upsert({
      id: scenarioId,
      name: scenario.name,
      version: scenario.version,
      description: scenario.description,
      default_player_count_min: scenario.default_player_count_min,
      default_player_count_max: scenario.default_player_count_max,
      default_schedule_json: scenario.schedule,
      setting_json: scenario.setting ?? {},
    });
    if (error) throw error;
  }

  // 2. Tear down child rows for this scenario. We only delete from tables that
  // actually have a `scenario_id` column. Cascading FKs handle the rest:
  //   * deleting `role` cascades to `role_availability`
  //   * deleting `map` cascades to `map_score_track` and `map_location`
  //   * deleting `card_template` cascades to `starting_resource_distribution`
  // The order below respects FK dependencies that don't cascade across these
  // scenario-rooted siblings.
  for (const table of [
    'war_correspondence',
    'starting_resource_distribution',
    'card_template',
    'map',
    'npc_template',
    'role',
    'faction',
  ]) {
    const { error } = await supabase.from(table).delete().eq('scenario_id', scenarioId);
    if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
  }

  // 3. Factions
  {
    const rows = scenario.factions.map((f) => ({
      id: f.id,
      scenario_id: scenarioId,
      name: f.name,
      short_name: f.short_name,
      colour: f.colour,
      icon_url: f.icon_url,
      icon_small_url: f.icon_small_url,
      icon_colour_url: f.icon_colour_url,
      public_brief: f.public_brief,
      common_goals: f.common_goals,
      sort_order: f.sort_order,
    }));
    const { error } = await supabase.from('faction').insert(rows);
    if (error) throw error;
    console.log(`  inserted ${rows.length} factions`);
  }

  // 4. Roles + role availability
  const roleIdByCode = new Map();
  {
    const rows = scenario.roles.map((r) => ({
      scenario_id: scenarioId,
      faction_id: r.faction_id,
      code: r.code,
      name: r.name,
      public_description: r.public_description,
      private_brief: r.private_brief,
      personal_goal: r.personal_goal,
      initiative_by_turn: r.initiative_by_turn,
      sort_order: r.sort_order,
    }));
    const { data, error } = await supabase
      .from('role')
      .insert(rows)
      .select('id, code');
    if (error) throw error;
    for (const row of data) roleIdByCode.set(row.code, row.id);
    console.log(`  inserted ${data.length} roles`);
  }
  {
    const availabilityRows = [];
    for (const r of scenario.roles) {
      const roleId = roleIdByCode.get(r.code);
      for (const a of r.availability ?? []) {
        availabilityRows.push({
          role_id: roleId,
          player_count: a.player_count,
          is_recommended: a.is_recommended,
        });
      }
    }
    if (availabilityRows.length) {
      const { error } = await supabase.from('role_availability').insert(availabilityRows);
      if (error) throw error;
      console.log(`  inserted ${availabilityRows.length} role availability rows`);
    }
  }

  // 5. NPCs
  // Note: this only seeds the NPC TEMPLATES (`npc_template`). NPCs become
  // actual `participant` rows when a game session is created and the create-
  // session RPC binds each template to a participant row controlled by the
  // appropriate facilitator. Do not create participant rows from here.
  {
    const rows = (scenario.npcs ?? []).map((n) => ({
      scenario_id: scenarioId,
      code: n.code,
      name: n.name,
      default_controller: n.default_controller,
      public_description: n.public_description,
      facilitator_notes: n.facilitator_notes,
    }));
    if (rows.length) {
      const { error } = await supabase.from('npc_template').insert(rows);
      if (error) throw error;
      console.log(`  inserted ${rows.length} NPC templates`);
    }
  }

  // 6. Maps, score tracks, locations
  {
    const mapRows = scenario.maps.map((m) => ({
      id: m.id,
      scenario_id: scenarioId,
      name: m.name,
      image_url: m.image_url,
      sort_order: m.sort_order,
    }));
    {
      const { error } = await supabase.from('map').insert(mapRows);
      if (error) throw error;
      console.log(`  inserted ${mapRows.length} maps`);
    }
    const trackRows = [];
    const locationRows = [];
    for (const m of scenario.maps) {
      for (const t of m.score_tracks ?? []) {
        trackRows.push({
          id: t.id,
          map_id: m.id,
          name: t.name,
          description: t.description,
          min_value: t.min_value,
          max_value: t.max_value,
          starting_value: t.starting_value,
          visible_to_players: t.visible_to_players,
          shared_with_map_ids: t.shared_with_map_ids ?? [],
          sort_order: t.sort_order,
        });
      }
      for (const l of m.locations ?? []) {
        locationRows.push({
          id: l.id,
          map_id: m.id,
          name: l.name,
          description: l.description,
          valid_for_actions: l.valid_for_actions,
          sort_order: l.sort_order,
        });
      }
    }
    if (trackRows.length) {
      const { error } = await supabase.from('map_score_track').insert(trackRows);
      if (error) throw error;
      console.log(`  inserted ${trackRows.length} score tracks`);
    }
    if (locationRows.length) {
      const { error } = await supabase.from('map_location').insert(locationRows);
      if (error) throw error;
      console.log(`  inserted ${locationRows.length} locations`);
    }
  }

  // 7. Card templates
  {
    const rows = scenario.card_templates.map((c) => ({
      id: c.id,
      scenario_id: scenarioId,
      card_type: c.card_type,
      name: c.name,
      faction_id: c.faction_id ?? null,
      owner_role_code: c.owner_role_code ?? null,
      rules_text: c.rules_text ?? null,
      flavour_text: c.flavour_text ?? null,
      impact_bonus: c.impact_bonus ?? 0,
      tradeable: c.tradeable,
      reclaimable: c.reclaimable,
      image_url: c.image_url ?? null,
    }));
    const { error } = await supabase.from('card_template').insert(rows);
    if (error) throw error;
    console.log(`  inserted ${rows.length} card templates`);
  }

  // 8. Starting resource distribution
  {
    const rows = (scenario.starting_resource_distribution ?? []).map((d) => ({
      scenario_id: scenarioId,
      role_code: d.role_code,
      resource_template_id: d.resource_template_id,
      count: d.count,
    }));
    if (rows.length) {
      const { error } = await supabase.from('starting_resource_distribution').insert(rows);
      if (error) throw error;
      console.log(`  inserted ${rows.length} starting resource distribution rows`);
    }
  }

  // 9. War correspondence
  {
    const rows = (scenario.war_correspondence ?? []).map((w) => ({
      scenario_id: scenarioId,
      turn: w.turn,
      title: w.title,
      public_text: w.public_text,
      facilitator_notes: w.facilitator_notes,
      suggested_effects_json: w.suggested_effects ?? [],
    }));
    if (rows.length) {
      const { error } = await supabase.from('war_correspondence').insert(rows);
      if (error) throw error;
      console.log(`  inserted ${rows.length} war correspondence rows`);
    }
  }

  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
