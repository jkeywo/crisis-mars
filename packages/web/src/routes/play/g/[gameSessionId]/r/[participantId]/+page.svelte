<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { ensureAnonSession } from '$lib/supabase';
  import { PHASE_LABELS, type PhaseKind } from '$shared/constants/phases';

  const { gameSessionId, participantId } = $derived($page.params);

  // ──────────────────────────────────────────────────────────────────────────
  // Data types
  // ──────────────────────────────────────────────────────────────────────────

  interface RoleBrief {
    role_id: string;
    code: string;
    name: string;
    private_brief: string;
    personal_goal: string;
  }

  interface ParticipantInfo {
    display_name: string | null;
    faction_id: string;
    role_id: string;
    permission_level: string;
    active_device_count: number;
  }

  interface FactionInfo {
    id: string;
    name: string;
    short_name: string;
    colour: string;
    common_goals: string[];
  }

  interface SessionInfo {
    title: string;
    status: string;
    current_turn: number;
    current_phase: string;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Page state — named pageState to avoid Svelte 4 store shorthand conflict
  // ──────────────────────────────────────────────────────────────────────────

  type PageState =
    | { phase: 'loading' }
    | { phase: 'unconfigured' }
    | { phase: 'error'; message: string }
    | {
        phase: 'ready';
        participant: ParticipantInfo;
        brief: RoleBrief;
        faction: FactionInfo;
        session: SessionInfo;
      };

  let pageState = $state<PageState>({ phase: 'loading' });
  let briefVisible = $state(false);

  function bannerTextColour(hex: string): string {
    if (!hex || hex.length < 7) return '#ffffff';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.5 ? '#ffffff' : '#1f2933';
  }

  onMount(async () => {
    const supabase = await ensureAnonSession();
    if (!supabase) { pageState = { phase: 'unconfigured' }; return; }

    const sb = supabase as any;
    const [partRes, briefRes, sessionRes] = await Promise.all([
      sb.from('participant')
        .select('display_name, faction_id, role_id, permission_level, active_device_count')
        .eq('id', participantId)
        .eq('game_session_id', gameSessionId)
        .single(),
      sb.rpc('get_my_role_brief'),
      sb.from('game_session')
        .select('title, status, current_turn, current_phase')
        .eq('id', gameSessionId)
        .single(),
    ]);

    if (partRes.error || !partRes.data) {
      pageState = { phase: 'error', message: 'Could not load your role. Try rescanning the badge QR.' };
      return;
    }
    if (sessionRes.error) {
      // Non-fatal: we can still show the brief without the session header.
      // The session pill will show the fallback 'Prologue' text.
      console.warn('game_session read failed:', sessionRes.error);
    }

    const factionResult = await sb
      .from('faction')
      .select('id, name, short_name, colour, common_goals')
      .eq('id', (partRes.data as ParticipantInfo).faction_id)
      .single();

    if (factionResult.error || !factionResult.data) {
      pageState = { phase: 'error', message: 'Could not load faction data.' };
      return;
    }
    if (briefRes.error || !briefRes.data || (briefRes.data as RoleBrief[]).length === 0) {
      pageState = { phase: 'error', message: 'Could not load role brief. Check your session is still active.' };
      return;
    }

    pageState = {
      phase: 'ready',
      participant: partRes.data as ParticipantInfo,
      brief: (briefRes.data as RoleBrief[])[0]!,
      faction: factionResult.data as FactionInfo,
      session: (sessionRes.data ?? {
        title: 'Crisis: Mars', status: 'live', current_turn: 0, current_phase: 'prologue'
      }) as SessionInfo,
    };
  });
</script>

<svelte:head>
  {#if pageState.phase === 'ready'}
    <title>{pageState.brief.name} · {pageState.faction.name} · Crisis: Mars</title>
  {:else}
    <title>Crisis: Mars</title>
  {/if}
</svelte:head>

{#if pageState.phase === 'loading'}
  <div class="center">
    <div class="spinner" aria-label="Loading"></div>
    <p class="loading-text">Loading your role…</p>
  </div>

{:else if pageState.phase === 'unconfigured'}
  <div class="msg warn">
    <h2>Not configured</h2>
    <p>The app is not connected to a database. Ask a facilitator for help.</p>
  </div>

{:else if pageState.phase === 'error'}
  <div class="msg warn">
    <h2>Error</h2>
    <p><code>{pageState.message}</code></p>
  </div>

{:else}
  {@const s = pageState}

  <!-- Faction banner -->
  <div class="faction-banner"
    style:background={s.faction.colour}
    style:color={bannerTextColour(s.faction.colour)}>
    <div class="banner-left">
      <span class="faction-name">{s.faction.name}</span>
      <span class="role-code-pill">{s.brief.code}</span>
    </div>
    <span class="session-pill">
      {s.session.current_turn === 0 ? 'Prologue' : `Turn ${s.session.current_turn}`}
      · {PHASE_LABELS[s.session.current_phase as PhaseKind] ?? s.session.current_phase}
    </span>
  </div>

  <!-- Identity -->
  <div class="block identity">
    <h1>{s.brief.name}</h1>
    {#if s.participant.display_name}
      <p class="player-name">Playing as: <strong>{s.participant.display_name}</strong></p>
    {/if}
    {#if s.participant.active_device_count > 1}
      <p class="multi-device-warn">⚠ This role is active on {s.participant.active_device_count} devices.</p>
    {/if}
  </div>

  <!-- Private brief -->
  <div class="block">
    <div class="brief-header">
      <h2>Role Brief</h2>
      <button class="privacy-toggle" onclick={() => (briefVisible = !briefVisible)}>
        {briefVisible ? 'Hide' : 'Show'}
      </button>
    </div>
    {#if briefVisible}
      <div class="brief-text">{s.brief.private_brief}</div>
      <div class="privacy-warning">
        ⚠ Do not show this screen to other players.
      </div>
    {:else}
      <p class="brief-hidden">Tap <strong>Show</strong> to reveal your private brief.</p>
    {/if}
  </div>

  <!-- Personal goal -->
  <div class="block">
    <h2>Personal Goal</h2>
    <div class="goal-text">{s.brief.personal_goal}</div>
  </div>

  <!-- Faction common goals -->
  <div class="block">
    <h2>Faction Goals — {s.faction.name}</h2>
    <ol class="goals-list">
      {#each s.faction.common_goals as goal}
        <li>{goal}</li>
      {/each}
    </ol>
  </div>

  <!-- Placeholders for future steps -->
  <div class="block placeholder-block">
    <h2>Resource hand</h2>
    <p class="hint">Coming in build-priority step 15 (resource ledger).</p>
  </div>
  <div class="block placeholder-block">
    <h2>Action card</h2>
    <p class="hint">Coming in build-priority step 12 (action card placement).</p>
  </div>
{/if}

<style>
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: 1rem;
  }
  .spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 3px solid #2d3a45;
    border-top-color: #ffb86b;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-text { color: #95a3b1; font-size: 0.9rem; }

  .msg { padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
  .msg.warn { border: 1px solid #ffb86b; background: rgba(255,184,107,0.08); }
  .msg code { background: #14202a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; }

  .faction-banner {
    margin: -1.5rem -1rem 1rem;
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .banner-left { display: flex; align-items: center; gap: 0.75rem; }
  .faction-name { font-weight: 700; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; }
  .role-code-pill {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.75rem;
    background: rgba(0,0,0,0.2);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }
  .session-pill { font-size: 0.8rem; opacity: 0.8; }

  .block { margin: 0 0 1.5rem; }
  .identity h1 { margin: 0 0 0.25rem; font-size: 1.8rem; font-weight: 800; letter-spacing: -0.02em; }
  .player-name { margin: 0; color: #95a3b1; font-size: 0.9rem; }
  .multi-device-warn { margin: 0.5rem 0 0; color: #ffb86b; font-size: 0.85rem; }

  h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }

  .brief-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .brief-header h2 { margin: 0; }
  .privacy-toggle {
    font-size: 0.8rem;
    padding: 0.25rem 0.75rem;
    background: #2a3641;
    border: 1px solid #3a4855;
    border-radius: 6px;
    color: #c2cdd6;
    cursor: pointer;
  }
  .brief-text {
    background: #14202a;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    line-height: 1.55;
    white-space: pre-wrap;
    color: #e2e8f0;
  }
  .privacy-warning {
    margin: 0.5rem 0 0;
    color: #b3261e;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .brief-hidden { margin: 0; color: #95a3b1; font-size: 0.9rem; }

  .goal-text {
    background: #14202a;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    line-height: 1.5;
    white-space: pre-wrap;
    color: #e2e8f0;
  }

  .goals-list {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: #c2cdd6;
    line-height: 1.5;
  }

  .placeholder-block {
    border: 1px dashed #2d3a45;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    opacity: 0.6;
  }
  .placeholder-block h2 { color: #95a3b1; }
  .hint { margin: 0; color: #95a3b1; font-size: 0.85rem; }
</style>
