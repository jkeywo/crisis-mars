#!/usr/bin/env node
// Create a new Crisis: Mars game session against a running Supabase instance.
//
// Usage:
//   npm run session:create -- --title "Crisis Mars Tuesday 7pm"
//   npm run session:create -- --title "Smoke" --scenario crisis-mars-v1 --no-observer
//   npm run session:create -- --base-url https://crisis-mars.app --title "Live"
//
// Generates three unguessable tokens locally, passes them to the
// `create_game_session` RPC (which hashes them with SHA-256 inside Postgres),
// and prints the three URLs the operator will hand out.
//
// Requires env vars (in .env at the repo root):
//   PUBLIC_SUPABASE_URL          e.g. http://127.0.0.1:54321
//   SUPABASE_SERVICE_ROLE_KEY    operator-only secret. NEVER ship to clients.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
loadEnv({ path: resolve(root, '.env') });

const { values: args } = parseArgs({
  options: {
    title: { type: 'string', short: 't' },
    scenario: { type: 'string', short: 's', default: 'crisis-mars-v1' },
    'base-url': { type: 'string', default: 'http://127.0.0.1:5173' },
    'no-observer': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.title) {
  console.error('Missing required --title. Run with --help for usage.');
  process.exit(1);
}

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  console.error('For local dev, run `supabase start` and copy the printed values into .env.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function makeToken() {
  // 24 random bytes = 192 bits of entropy. base64url is URL-safe.
  return randomBytes(24).toString('base64url');
}

const joinToken = makeToken();
const facilitatorToken = makeToken();
const observerToken = args['no-observer'] ? null : makeToken();

const { data, error } = await supabase.rpc('create_game_session', {
  p_scenario_id: args.scenario,
  p_title: args.title,
  p_join_token: joinToken,
  p_facilitator_token: facilitatorToken,
  p_observer_token: observerToken,
});

if (error) {
  console.error('Failed to create session:', error.message);
  if (error.details) console.error('Details:', error.details);
  if (error.hint) console.error('Hint:', error.hint);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.error('RPC returned no rows. Check the Supabase logs.');
  process.exit(1);
}

const row = data[0];
const baseUrl = args['base-url'].replace(/\/$/, '');

const facilitatorUrl = `${baseUrl}/facilitator/${facilitatorToken}`;
const joinUrl = `${baseUrl}/join/g/${joinToken}`;
const observerUrl = observerToken ? `${baseUrl}/observe/${observerToken}` : null;

const npcs = Array.isArray(row.npc_participant_ids) ? row.npc_participant_ids : [];

console.log('');
console.log('Session created successfully.');
console.log('');
console.log(`  Title:      ${args.title}`);
console.log(`  Scenario:   ${args.scenario}`);
console.log(`  Session id: ${row.game_session_id}`);
console.log(`  NPCs:       ${npcs.length}`);
console.log(`  Scores:     ${row.score_value_count}`);
console.log('');
console.log('URLs (give the facilitator URL to facilitators ONLY):');
console.log('');
console.log(`  Facilitator: ${facilitatorUrl}`);
console.log(`  Join:        ${joinUrl}`);
if (observerUrl) {
  console.log(`  Observer:    ${observerUrl}`);
}
console.log('');
console.log('These URLs are shown ONCE. Save them now; they cannot be retrieved.');
console.log('If you lose the facilitator URL you will need to create a new session.');
console.log('');

function printHelp() {
  console.log(`Usage: npm run session:create -- [options]

Required:
  --title, -t <string>          Human-readable session title.

Optional:
  --scenario, -s <id>           Scenario id to bind to. Default: crisis-mars-v1.
  --base-url <url>              Origin to use when building URLs.
                                Default: http://127.0.0.1:5173.
  --no-observer                 Skip the observer token.
  --help, -h                    Show this help.

Environment (.env at repo root):
  PUBLIC_SUPABASE_URL           Supabase project URL.
  SUPABASE_SERVICE_ROLE_KEY     Operator-only service role key.

Example:
  npm run session:create -- --title "Friday night playtest" \\
    --base-url https://crisis-mars.app
`);
}
