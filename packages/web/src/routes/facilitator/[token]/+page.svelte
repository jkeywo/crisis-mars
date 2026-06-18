<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { loadFacilitatorSession, groupScoresByMap, type MapScoreGroup } from '$lib/facilitator';
  import { PHASE_LABELS, type PhaseKind } from '$shared/constants/phases';
  import type { FacilitatorSummary, FacilitatorSummaryRoleBadge } from '$shared/types/api';

  let state = $state<
    | { kind: 'loading' }
    | { kind: 'unconfigured' }
    | { kind: 'not-found' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; summary: FacilitatorSummary; groups: MapScoreGroup[] }
  >({ kind: 'loading' });

  onMount(async () => {
    const token = $page.params.token ?? '';
    const result = await loadFacilitatorSession(token);
    if (!result.ok) {
      if (result.reason === 'unconfigured') state = { kind: 'unconfigured' };
      else if (result.reason === 'not-found') state = { kind: 'not-found' };
      else state = { kind: 'error', message: result.message ?? 'Unknown error' };
      return;
    }
    state = {
      kind: 'ready',
      summary: result.summary,
      groups: groupScoresByMap(result.summary.score_values),
    };
  });

  function controllerLabel(c: string): string {
    if (c === 'earth_control') return 'Earth Control';
    if (c === 'mars_control') return 'Mars Control';
    if (c === 'belt_control') return 'Belt Control';
    return c;
  }

  function controllerColour(c: string): string {
    if (c === 'earth_control') return '#1f6feb';
    if (c === 'mars_control') return '#d6371e';
    if (c === 'belt_control') return '#e0a526';
    return '#666';
  }
</script>

<svelte:head>
  {#if state.kind === 'ready'}
    <title>{state.summary.title} &middot; Facilitator &middot; Crisis: Mars</title>
  {:else}
    <title>Facilitator dashboard &middot; Crisis: Mars</title>
  {/if}
</svelte:head>

{#if state.kind === 'loading'}
  <p>Loading session...</p>
{:else if state.kind === 'unconfigured'}
  <section class="warn">
    <h2>Backend not configured</h2>
    <p>
      Set <code>PUBLIC_SUPABASE_URL</code> and <code>PUBLIC_SUPABASE_ANON_KEY</code> in
      <code>.env</code>, then restart the dev server.
    </p>
    <p><a href="/facilitator">&larr; Back</a></p>
  </section>
{:else if state.kind === 'not-found'}
  <section class="warn">
    <h2>Facilitator link not recognised</h2>
    <p>
      Either the URL is wrong, the session has been deleted, or this is a stale token from a
      previous database. Re-run <code>npm run session:create</code> to start a new session.
    </p>
    <p><a href="/facilitator">&larr; Back</a></p>
  </section>
{:else if state.kind === 'error'}
  <section class="warn">
    <h2>Could not load the session</h2>
    <p><code>{state.message}</code></p>
    <p><a href="/facilitator">&larr; Back</a></p>
  </section>
{:else}
  {@const s = state.summary}
  <header class="dashboard-header">
    <div>
      <h1>{s.title}</h1>
      <p class="meta">
        Scenario <code>{s.scenario_id}</code>
        &middot; session
        <code title={s.game_session_id}>{s.game_session_id.slice(0, 8)}&hellip;</code>
      </p>
    </div>
    <span class="pill pill-{s.status}">{s.status}</span>
  </header>

  <section class="block">
    <h2>Status</h2>
    <dl class="kv">
      <dt>Turn</dt>
      <dd>{s.current_turn === 0 ? 'Prologue' : s.current_turn}</dd>
      <dt>Phase</dt>
      <dd>{PHASE_LABELS[s.current_phase as PhaseKind] ?? s.current_phase}</dd>
      <dt>Phase started</dt>
      <dd>{new Date(s.phase_started_at).toLocaleString()}</dd>
      {#if s.phase_paused_at}
        <dt>Paused at</dt>
        <dd>{new Date(s.phase_paused_at).toLocaleString()}</dd>
      {/if}
      <dt>Phase duration</dt>
      <dd>
        {#if s.phase_duration_seconds != null}
          {Math.round(s.phase_duration_seconds / 60)} min
        {:else}
          &mdash;
        {/if}
      </dd>
    </dl>
    <p class="hint">
      Live timer, pause/resume/skip and end-of-turn controls land in build-priority step 9. This
      dashboard is read-only.
    </p>
  </section>

  <section class="block">
    <h2>NPCs ({s.npcs.length})</h2>
    <ul class="npc-list">
      {#each s.npcs as npc (npc.participant_id)}
        <li class="npc-card">
          <div class="npc-head">
            <span class="npc-code">{npc.code}</span>
            <span class="npc-name">{npc.display_name}</span>
            <span class="chip" style:background={controllerColour(npc.default_controller)}>
              {controllerLabel(npc.default_controller)}
            </span>
          </div>
          <p class="npc-desc">{npc.public_description}</p>
          <p class="npc-cards">0 resource cards (NPC hands seed in MVP 3)</p>
        </li>
      {/each}
    </ul>
  </section>

  <section class="block">
    <h2>Role badges ({s.role_badges?.length ?? 0} roles)</h2>
    {#if s.role_badges && s.role_badges.length > 0}
      {@const generated = s.role_badges.filter((r: FacilitatorSummaryRoleBadge) => r.badge_generated).length}
      {@const claimed = s.role_badges.filter((r: FacilitatorSummaryRoleBadge) => r.claimed_at !== null).length}
      <div class="badge-summary">
        <span class="badge-count {generated > 0 ? 'ok' : 'warn'}">{generated}/{s.role_badges.length} badges generated</span>
        <span class="badge-count">{claimed}/{s.role_badges.length} claimed</span>
      </div>
      <table class="score-table roles-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Role</th>
            <th>Faction</th>
            <th>Badge</th>
            <th>Claimed by</th>
          </tr>
        </thead>
        <tbody>
          {#each s.role_badges as rb (rb.role_id)}
            <tr class={rb.claimed_at ? 'row-claimed' : ''}>
              <td><code>{rb.role_code}</code></td>
              <td>{rb.role_name}</td>
              <td><span class="faction-label">{rb.faction_name}</span></td>
              <td>
                {#if rb.badge_generated}
                  <span class="pill-sm pill-ok">generated</span>
                {:else}
                  <span class="pill-sm pill-warn">none</span>
                {/if}
              </td>
              <td>
                {#if rb.claimed_at}
                  <span class="claimed-name">{rb.claimed_by ?? 'unknown'}</span>
                  {#if (rb.active_device_count ?? 0) > 1}
                    <span class="pill-sm pill-multi" title="{rb.active_device_count} devices">
                      {rb.active_device_count}📱
                    </span>
                  {/if}
                {:else}
                  <span class="unclaimed">&mdash;</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if generated === 0}
        <p class="hint">
          Run <code>npm run badges:generate -- --session {s.game_session_id} --join-token &lt;joinToken&gt;</code>
          to mint QR tokens and generate printable badge HTML.
        </p>
      {:else}
        <p class="hint">
          To reprint or regenerate, re-run <code>badges:generate</code>. Old QR codes will be rotated and become invalid.
        </p>
      {/if}
    {:else}
      <p class="hint">
        Run <code>npm run badges:generate -- --session {s.game_session_id} --join-token &lt;joinToken&gt;</code>
        to generate printable role badges.
      </p>
    {/if}
  </section>

  <section class="block">
    <h2>Map scores ({s.score_values.length} tracks)</h2>
    <div class="maps">
      {#each state.groups as group (group.map_id)}
        <div class="map-group">
          <h3>{group.map_name}</h3>
          <table class="score-table">
            <thead>
              <tr>
                <th>Track</th>
                <th class="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {#each group.tracks as t (t.score_track_id)}
                <tr>
                  <td>
                    {t.track_name}
                    {#if t.is_shared_in_from}
                      <span class="shared">(shared from {t.is_shared_in_from})</span>
                    {/if}
                  </td>
                  <td class="num">{t.current_value}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
    <p class="hint">Score editing lands in build-priority step 11.</p>
  </section>

  <footer class="dash-footer">
    <p>
      Casting (step 8), timers (step 9), maps (step 10), score editing
      (step 11), action cards (step 12+) and the resource ledger (step 15+) are not yet wired up.
    </p>
  </footer>
{/if}

<style>
  h1 {
    margin: 0;
    font-size: 1.6rem;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: #c2cdd6;
  }
  code {
    background: #14202a;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.85em;
  }

  .dashboard-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #2d3a45;
  }
  .meta {
    margin: 0.25rem 0 0;
    color: #95a3b1;
    font-size: 0.9rem;
  }
  .pill {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .pill-live {
    background: #2ea043;
    color: #fff;
  }
  .pill-draft {
    background: #6e7681;
    color: #fff;
  }
  .pill-paused {
    background: #ffb86b;
    color: #1f2933;
  }
  .pill-ended,
  .pill-archived {
    background: #444;
    color: #fff;
  }

  .block {
    margin: 0 0 2rem;
  }
  .hint {
    margin: 0.5rem 0 0;
    color: #95a3b1;
    font-size: 0.85rem;
  }

  .kv {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
  }
  .kv dt {
    color: #95a3b1;
  }
  .kv dd {
    margin: 0;
  }

  .npc-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 1rem;
  }
  .npc-card {
    padding: 1rem;
    background: #2a3641;
    border: 1px solid #3a4855;
    border-radius: 8px;
  }
  .npc-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .npc-code {
    font-family: ui-monospace, SFMono-Regular, monospace;
    background: #14202a;
    padding: 0.1rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .npc-name {
    font-weight: 600;
  }
  .chip {
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #fff;
  }
  .npc-desc {
    margin: 0 0 0.5rem;
    color: #c2cdd6;
    line-height: 1.4;
  }
  .npc-cards {
    margin: 0;
    color: #95a3b1;
    font-size: 0.85rem;
  }

  .maps {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: 1fr;
  }
  @media (min-width: 640px) {
    .maps {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
  }
  .map-group {
    padding: 1rem;
    background: #2a3641;
    border: 1px solid #3a4855;
    border-radius: 8px;
  }
  .score-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  .score-table th,
  .score-table td {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #3a4855;
    text-align: left;
  }
  .score-table thead th {
    color: #95a3b1;
    font-weight: 500;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .shared {
    color: #95a3b1;
    font-size: 0.8em;
    margin-left: 0.25rem;
  }

  /* Role badges section */
  .badge-summary {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  .badge-count {
    font-size: 0.85rem;
    color: #c2cdd6;
  }
  .badge-count.ok { color: #2ea043; }
  .badge-count.warn { color: #ffb86b; }
  .roles-table { font-size: 0.85rem; }
  .row-claimed td { opacity: 0.65; }
  .faction-label {
    font-size: 0.75rem;
    color: #95a3b1;
  }
  .pill-sm {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .pill-ok { background: #1a3c26; color: #4ade80; }
  .pill-warn { background: #3a2e1a; color: #ffb86b; }
  .pill-multi { background: #3a2e1a; color: #ffb86b; margin-left: 0.25rem; }
  .claimed-name { color: #c2cdd6; }
  .unclaimed { color: #4a5568; }

  .dash-footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #2d3a45;
    color: #95a3b1;
    font-size: 0.85rem;
  }

  .warn {
    margin: 1.5rem 0;
    padding: 1rem 1.25rem;
    border: 1px solid #ffb86b;
    background: rgba(255, 184, 107, 0.1);
    border-radius: 8px;
    color: #ffe0b2;
  }
  .warn h2 {
    margin: 0 0 0.5rem;
  }
</style>
