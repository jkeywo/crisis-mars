#!/usr/bin/env node
// Generate printable role badge HTML for a Crisis: Mars session.
//
// Usage:
//   npm run badges:generate -- \
//     --session <game-session-uuid> \
//     --join-token <raw-join-token-from-session:create> \
//     --base-url https://crisis-mars.pages.dev \
//     --out ./badges.html
//   Optional:
//     --player-count 12   filter to roles recommended for N players
//     --single-sided      layout: front+back on same page (fold vertically)
//
// What it does:
//   1. Reads scenario/crisis-mars-v1.json for faction colours and role data.
//   2. Generates 18 (or fewer with --player-count) role badge tokens + manual codes.
//   3. Calls the generate_role_access_tokens RPC (service-role key).
//   4. Renders a self-contained HTML file with embedded QR SVGs.
//   5. Writes the HTML file and prints a summary.
//
// Requires .env: PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import QRCode from 'qrcode';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
loadEnv({ path: resolve(root, '.env') });

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    session: { type: 'string', short: 's' },
    'join-token': { type: 'string', short: 'j' },
    'base-url': { type: 'string', default: 'http://127.0.0.1:5173' },
    'out': { type: 'string', short: 'o', default: './badges.html' },
    'player-count': { type: 'string', short: 'p' },
    'single-sided': { type: 'boolean', default: false },
    'scenario': { type: 'string', default: 'crisis-mars-v1' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.session) { console.error('Missing --session. Run with --help for usage.'); process.exit(1); }
if (!args['join-token']) { console.error('Missing --join-token. This is the raw join token printed by session:create.'); process.exit(1); }
if (args['join-token'].length < 32) { console.error('--join-token looks too short (expected ~32 chars base64url). Check you pasted the full value.'); process.exit(1); }

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load scenario data locally (no DB round-trip needed for role metadata)
// ---------------------------------------------------------------------------

const scenarioPath = resolve(root, `scenario/${args.scenario}.json`);
let scenario;
try {
  scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
} catch {
  console.error(`Cannot read scenario file: ${scenarioPath}`);
  process.exit(1);
}

/** @type {Map<string, {name:string,short_name:string,colour:string}>} */
const factionMap = new Map(scenario.factions.map((f) => [f.id, f]));

// Filter roles by player count if specified.
const playerCount = args['player-count'] ? parseInt(args['player-count'], 10) : null;
let roles = scenario.roles;
if (playerCount !== null) {
  roles = roles.filter((r) =>
    r.availability.some(
      (a) => a.player_count <= playerCount && a.is_recommended,
    ),
  );
  if (roles.length === 0) {
    console.error(`No recommended roles found for player count ${playerCount}.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Token generation helpers
// ---------------------------------------------------------------------------

function makeToken() {
  // 24 random bytes → 32-char URL-safe base64url. ADR 0003 standard.
  return randomBytes(24).toString('base64url');
}

// Manual code: 6 chars from an unambiguous 16-char alphabet.
// 16^6 ≈ 16.7M combinations — sufficient for a manual fallback code per role.
// 16 chars: power of 2, so `byte % 16` has zero modulo bias (256 = 16 × 16).
// Excluded: 0/O (confusable), 1/I/L (confusable), S/5 (font-dependent),
//           G/C/Q (confusable), 2/Z (confusable), U/V (confusable).
const MANUAL_ALPHA = 'ABDEFHJKMNPRTWXY'; // exactly 16 unambiguous characters
function makeManualCode() {
  const bytes = randomBytes(6);
  let code = '';
  for (const b of bytes) {
    code += MANUAL_ALPHA[b % MANUAL_ALPHA.length]; // zero bias: 256 / 16 = 16
  }
  return code; // stored/hashed without hyphen; displayed as "ABC-DEF"
}
function formatCode(code) {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

// ---------------------------------------------------------------------------
// Generate token arrays (parallel with roles array)
// ---------------------------------------------------------------------------

const rawTokens = roles.map(() => makeToken());
const rawManualCodes = roles.map(() => makeManualCode());

// Role IDs to pass to the RPC. When filtering by player count we pass only
// the selected role IDs so the RPC can validate array lengths correctly.
// When all roles are included, pass null so the RPC fetches all roles itself.
const roleIds = playerCount !== null ? roles.map((r) => r.id) : null;

// ---------------------------------------------------------------------------
// Call generate_role_access_tokens RPC
// ---------------------------------------------------------------------------

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Generating badges for session ${args.session}...`);
console.log(`  Roles: ${roles.length}${playerCount ? ` (filtered for ${playerCount} players)` : ''}`);

const { data: rpcData, error: rpcError } = await supabase.rpc(
  'generate_role_access_tokens',
  {
    p_game_session_id: args.session,
    p_role_ids: roleIds,
    p_role_tokens: rawTokens,
    p_manual_codes: rawManualCodes,
  },
);

if (rpcError) {
  console.error('RPC failed:', rpcError.message);
  if (rpcError.details) console.error('Details:', rpcError.details);
  if (rpcError.hint) console.error('Hint:', rpcError.hint);
  process.exit(1);
}

if (!Array.isArray(rpcData) || rpcData.length === 0) {
  console.error('RPC returned no rows. Check Supabase logs.');
  process.exit(1);
}

if (rpcData.length !== roles.length) {
  console.error(`RPC returned ${rpcData.length} rows but expected ${roles.length}. Aborting.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build badge data, merging RPC results with scenario metadata.
// The RPC echoes back (role_id, role_code, role_name, faction_id, token, manual_code, token_rotated).
// We enrich with faction colour from the local scenario JSON.
// ---------------------------------------------------------------------------

/** @type {Array<{code,name,factionName,factionShort,factionColour,publicDescription,token,manualCode,qrUrl}>} */
const badges = rpcData.map((row) => {
  const faction = factionMap.get(row.faction_id) ?? { name: row.faction_id, short_name: row.faction_id, colour: '#333' };
  const scenarioRole = scenario.roles.find((r) => r.code === row.role_code);
  const qrUrl = `${args['base-url'].replace(/\/$/, '')}/join/g/${args['join-token']}/r/${row.token}`;
  return {
    code: row.role_code,
    name: row.role_name,
    factionName: faction.name,
    factionShort: faction.short_name,
    factionColour: faction.colour,
    publicDescription: scenarioRole?.public_description ?? '',
    token: row.token,
    manualCode: formatCode(row.manual_code),
    qrUrl,
  };
});

// Warn only if any tokens were actually rotated (i.e. existing active tokens existed).
// token_rotated is accurate: the RPC uses GET DIAGNOSTICS after the UPDATE.
const anyRotated = rpcData.some((row) => row.token_rotated);
if (anyRotated) {
  const rotatedCount = rpcData.filter((row) => row.token_rotated).length;
  console.log(`  ⚠  ${rotatedCount} existing token(s) rotated. Previously printed badges are now INVALID.`);
  console.log('     Destroy old printed badges and use the new badges.html only.');
} else {
  console.log('  ✓  Fresh tokens minted. No existing badges were rotated.');
}

// ---------------------------------------------------------------------------
// Generate QR SVG for each badge
// ---------------------------------------------------------------------------

console.log('Generating QR codes...');

const qrSvgs = await Promise.all(
  badges.map((b) =>
    QRCode.toString(b.qrUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
    }),
  ),
);

// ---------------------------------------------------------------------------
// Render HTML
// ---------------------------------------------------------------------------

const baseUrl = args['base-url'].replace(/\/$/, '');
const singleSided = args['single-sided'];

function contrastColour(hex) {
  // Very rough luminance check: if dark background, use white text.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.5 ? '#ffffff' : '#1f2933';
}

function renderBadgeFront(badge) {
  const textColour = contrastColour(badge.factionColour);
  return `<div class="badge badge-front" style="background:${badge.factionColour};color:${textColour}">
  <div class="badge-header">
    <span class="faction-name">${badge.factionName}</span>
    <span class="role-code">${badge.code}</span>
  </div>
  <div class="role-name">${badge.name}</div>
  <div class="public-desc">${badge.publicDescription}</div>
  <div class="player-name-field">
    <span class="player-name-label">Player:</span>
    <span class="player-name-line"></span>
  </div>
</div>`;
}

function renderBadgeBack(badge, qrSvg) {
  // Sanitise the SVG to inline cleanly.
  const svgClean = qrSvg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .trim();
  return `<div class="badge badge-back">
  <div class="private-warning">&#x26A0;&#xFE0F; PRIVATE — do not show this side to other players</div>
  <div class="qr-container">${svgClean}</div>
  <div class="manual-code">Manual code: <strong>${badge.manualCode}</strong></div>
  <div class="manual-hint">If QR fails, visit:<br>${baseUrl}/join<br>and enter the code above.</div>
  <div class="badge-code-small">${badge.code} · ${badge.factionShort}</div>
</div>`;
}

function renderSingleSidedBadge(badge, qrSvg) {
  const textColour = contrastColour(badge.factionColour);
  const svgClean = qrSvg.replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/g, '').trim();
  return `<div class="badge badge-combined">
  <div class="half-front" style="background:${badge.factionColour};color:${textColour}">
    <div class="badge-header">
      <span class="faction-name">${badge.factionName}</span>
      <span class="role-code">${badge.code}</span>
    </div>
    <div class="role-name">${badge.name}</div>
    <div class="public-desc">${badge.publicDescription}</div>
    <div class="player-name-field">
      <span class="player-name-label">Player:</span>
      <span class="player-name-line"></span>
    </div>
  </div>
  <div class="half-back">
    <div class="private-warning-small">&#x26A0;&#xFE0F; PRIVATE — do not show to other players</div>
    <div class="qr-container-small">${svgClean}</div>
    <div class="manual-code-small">Code: <strong>${badge.manualCode}</strong></div>
    <div class="manual-hint-small">If QR fails: ${baseUrl}/join</div>
  </div>
</div>`;
}

const printSizeNote = singleSided
  ? '<!-- Single-sided: A6 landscape, fold in half -->'
  : '<!-- Double-sided: A7 landscape per side -->';

const cssPageRule = singleSided
  ? `@page { size: A6 landscape; margin: 5mm; }`
  : `@page { size: A7 landscape; margin: 0; }`;

const badgeHtml = singleSided
  ? badges.map((b, i) => renderSingleSidedBadge(b, qrSvgs[i])).join('\n')
  : badges.flatMap((b, i) => [renderBadgeFront(b), renderBadgeBack(b, qrSvgs[i])]).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Crisis: Mars — Role Badges (${args.session.slice(0,8)})</title>
${printSizeNote}
<style>
  /* ============================================================
     SCREEN PREVIEW
     ============================================================ */
  @media screen {
    body {
      background: #ccc;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 1rem;
    }
    .badge {
      width: 105mm;
      height: 74mm;
      margin: 0.5rem auto;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      border-radius: 3mm;
    }
    .badge-combined {
      width: 148mm;
      height: 105mm;
    }
  }

  /* ============================================================
     PRINT
     ============================================================ */
  @media print {
    body { margin: 0; padding: 0; }
  }
  ${cssPageRule}

  /* ============================================================
     BADGE BASE
     ============================================================ */
  .badge {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    page-break-after: always;
    page-break-inside: avoid;
  }

  /* ── FRONT ── */
  .badge-front {
    padding: 5mm;
    gap: 2mm;
  }
  .badge-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .faction-name {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.9;
  }
  .role-code {
    font-size: 9pt;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, monospace;
    background: rgba(0,0,0,0.15);
    padding: 1mm 2mm;
    border-radius: 2mm;
  }
  .role-name {
    font-size: 18pt;
    font-weight: 800;
    line-height: 1.1;
    margin-top: 1mm;
    letter-spacing: -0.02em;
  }
  .public-desc {
    font-size: 8pt;
    line-height: 1.3;
    opacity: 0.85;
    flex: 1;
  }
  .player-name-field {
    display: flex;
    align-items: center;
    gap: 2mm;
    margin-top: auto;
    border-top: 0.3mm solid rgba(255,255,255,0.4);
    padding-top: 2mm;
    font-size: 8pt;
  }
  .player-name-label { opacity: 0.8; white-space: nowrap; }
  .player-name-line {
    flex: 1;
    border-bottom: 0.3mm solid currentColor;
    opacity: 0.6;
  }

  /* ── BACK ── */
  .badge-back {
    background: #fff;
    color: #1f2933;
    padding: 4mm;
    align-items: center;
    text-align: center;
    gap: 1.5mm;
  }
  .private-warning {
    font-size: 7pt;
    font-weight: 700;
    color: #b3261e;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 0.5mm solid #b3261e;
    padding: 1mm 2mm;
    border-radius: 2mm;
    width: 100%;
  }
  .qr-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qr-container svg {
    width: 38mm;
    height: 38mm;
  }
  .manual-code {
    font-size: 9pt;
    font-family: ui-monospace, SFMono-Regular, monospace;
    letter-spacing: 0.12em;
  }
  .manual-hint {
    font-size: 6.5pt;
    color: #666;
    line-height: 1.3;
  }
  .badge-code-small {
    font-size: 6pt;
    color: #999;
    font-family: ui-monospace, SFMono-Regular, monospace;
    margin-top: auto;
  }

  /* ── SINGLE-SIDED (fold) ── */
  .badge-combined {
    background: #fff;
    flex-direction: row;
  }
  .half-front, .half-back {
    width: 50%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 4mm;
    gap: 1.5mm;
  }
  .half-back {
    align-items: center;
    text-align: center;
    border-left: 0.5mm dashed #ccc;
  }
  .private-warning-small {
    font-size: 6pt;
    font-weight: 700;
    color: #b3261e;
    text-transform: uppercase;
  }
  .qr-container-small {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qr-container-small svg {
    width: 28mm;
    height: 28mm;
  }
  .manual-code-small {
    font-size: 7.5pt;
    font-family: ui-monospace, SFMono-Regular, monospace;
    letter-spacing: 0.1em;
  }
  .manual-hint-small {
    font-size: 5.5pt;
    color: #666;
    line-height: 1.2;
  }

  /* Last badge: no trailing page break in print */
  .badge:last-child {
    page-break-after: auto;
  }
</style>
</head>
<body>
<!-- Generated by crisis-mars badges:generate -->
<!-- Session: ${args.session} -->
<!-- Scenario: ${args.scenario} -->
<!-- Badges: ${badges.length} -->
<!-- Layout: ${singleSided ? 'single-sided (fold)' : 'double-sided A7'} -->
<!-- QR base URL: ${args['base-url']} -->
${badgeHtml}
</body>
</html>`;

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outPath = resolve(process.cwd(), args.out);
writeFileSync(outPath, html, 'utf8');

console.log('');
console.log(`✓ Written ${badges.length} badges to: ${outPath}`);
console.log('');
console.log('Print instructions:');
console.log('  1. Open badges.html in any browser.');
console.log('  2. Press Ctrl+P (or Cmd+P).');
if (!singleSided) {
  console.log('  3. Enable "Two-sided" / "Duplex" printing, short-edge binding.');
  console.log('  4. Each physical sheet prints one badge (front + back).');
  console.log('     Cut sheets if needed; the page size is A7 (half A5).');
} else {
  console.log('  3. Print normally (single-sided, A6 landscape).');
  console.log('  4. Fold each page in half along the dashed line.');
}
console.log('');
console.log('⚠  Keep badges.html safe. If lost, re-run badges:generate');
console.log('   (new QR codes will be minted; old printed badges become invalid).');
console.log('');

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`Usage: npm run badges:generate -- [options]

Required:
  --session, -s <uuid>         game_session_id from session:create output.
  --join-token, -j <token>     raw join token from session:create output.

Optional:
  --base-url <url>             origin for QR URLs. Default: http://127.0.0.1:5173.
  --out, -o <path>             output HTML file. Default: ./badges.html.
  --scenario <id>              scenario id. Default: crisis-mars-v1.
  --player-count, -p <n>       only mint badges for roles recommended for N players.
  --single-sided               fold-style layout (A6) instead of duplex A7.
  --help, -h                   show this help.

Environment (.env at repo root):
  PUBLIC_SUPABASE_URL          Supabase project URL.
  SUPABASE_SERVICE_ROLE_KEY    Operator-only service role key.

Example:
  npm run badges:generate -- \\
    --session "d3e4f5a6-..." \\
    --join-token "aB3xCvYz..." \\
    --base-url https://crisis-mars.pages.dev \\
    --out ./badges.html
`);
}
