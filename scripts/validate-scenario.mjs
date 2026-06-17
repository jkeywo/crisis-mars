#!/usr/bin/env node
// Validate scenario/crisis-mars-v1.json against scenario/schema.json.
// Also runs a small set of cross-reference checks that JSON Schema alone can't
// express (faction IDs match between roles and factions, role codes match between
// card templates and roles, starting resources reference real templates and roles).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const schemaPath = resolve(root, 'scenario/schema.json');
const dataPath = resolve(root, 'scenario/crisis-mars-v1.json');

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const ok = validate(data);

if (!ok) {
  console.error('Schema validation failed for', dataPath);
  for (const err of validate.errors ?? []) {
    console.error(`  ${err.instancePath || '(root)'} ${err.message}`);
  }
  process.exit(1);
}

// Cross-reference checks
const errors = [];

const factionIds = new Set(data.factions.map((f) => f.id));
const roleCodes = new Set(data.roles.map((r) => r.code));
const npcCodes = new Set((data.npcs ?? []).map((n) => n.code));
const templateIds = new Set(data.card_templates.map((c) => c.id));
const allOwnerCodes = new Set([...roleCodes, ...npcCodes]);

for (const role of data.roles) {
  if (!factionIds.has(role.faction_id)) {
    errors.push(`Role ${role.code} references unknown faction "${role.faction_id}"`);
  }
}

const actionTemplates = data.card_templates.filter((c) => c.card_type === 'action');
const resourceTemplates = data.card_templates.filter((c) => c.card_type === 'resource');

for (const t of actionTemplates) {
  if (!t.owner_role_code) {
    errors.push(`Action card template ${t.id} missing owner_role_code`);
  } else if (!roleCodes.has(t.owner_role_code)) {
    errors.push(`Action card template ${t.id} references unknown role code ${t.owner_role_code}`);
  }
  if (t.faction_id && !factionIds.has(t.faction_id)) {
    errors.push(`Action card template ${t.id} references unknown faction ${t.faction_id}`);
  }
}

// Every role must have exactly one action card template.
for (const code of roleCodes) {
  const matches = actionTemplates.filter((t) => t.owner_role_code === code);
  if (matches.length !== 1) {
    errors.push(`Role ${code} should have exactly 1 action card template, has ${matches.length}`);
  }
}

// Resource template ids should look like resource.<snake_case>
for (const t of resourceTemplates) {
  if (!/^resource\.[a-z0-9_]+$/.test(t.id)) {
    errors.push(`Resource template id "${t.id}" should match resource.<snake_case>`);
  }
}

// Starting distribution sanity
const distribution = data.starting_resource_distribution ?? [];
for (const d of distribution) {
  if (!allOwnerCodes.has(d.role_code)) {
    errors.push(`starting_resource_distribution references unknown role/npc code ${d.role_code}`);
  }
  if (!templateIds.has(d.resource_template_id)) {
    errors.push(
      `starting_resource_distribution references unknown template ${d.resource_template_id}`,
    );
  }
  const template = data.card_templates.find((c) => c.id === d.resource_template_id);
  if (template && template.card_type !== 'resource') {
    errors.push(
      `starting_resource_distribution.${d.role_code}.${d.resource_template_id} is not a resource card`,
    );
  }
}

// Each played role should have exactly 5 starting resource cards (spec section 10.3).
for (const code of roleCodes) {
  const total = distribution
    .filter((d) => d.role_code === code)
    .reduce((s, d) => s + d.count, 0);
  if (total !== 5) {
    errors.push(`Role ${code} should have 5 starting resource cards, has ${total}`);
  }
}

// Each NPC should have at least 1 starting resource card.
for (const code of npcCodes) {
  const total = distribution
    .filter((d) => d.role_code === code)
    .reduce((s, d) => s + d.count, 0);
  if (total < 1) {
    errors.push(`NPC ${code} has no starting resources`);
  }
}

// Score tracks: ids should be globally unique and namespaced by map.
const seenTrackIds = new Set();
for (const map of data.maps) {
  for (const track of map.score_tracks ?? []) {
    if (seenTrackIds.has(track.id)) {
      errors.push(`Duplicate score track id ${track.id}`);
    }
    seenTrackIds.add(track.id);
  }
}

// War correspondence suggested_effects should reference real score tracks.
for (const wc of data.war_correspondence ?? []) {
  for (const eff of wc.suggested_effects ?? []) {
    if (eff.score_track_id && !seenTrackIds.has(eff.score_track_id)) {
      errors.push(
        `war_correspondence turn ${wc.turn} references unknown score track ${eff.score_track_id}`,
      );
    }
  }
}

if (errors.length) {
  console.error('Cross-reference validation failed:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log('scenario/crisis-mars-v1.json: OK');
console.log(`  factions:        ${data.factions.length}`);
console.log(`  roles:           ${data.roles.length}`);
console.log(`  npcs:            ${data.npcs?.length ?? 0}`);
console.log(`  maps:            ${data.maps.length}`);
console.log(`  score tracks:    ${seenTrackIds.size}`);
console.log(`  card templates:  ${data.card_templates.length} (${actionTemplates.length} action / ${resourceTemplates.length} resource)`);
console.log(
  `  starting cards:  ${distribution.reduce((s, d) => s + d.count, 0)} (${distribution.length} distribution entries)`,
);
