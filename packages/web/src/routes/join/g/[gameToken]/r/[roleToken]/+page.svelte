<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getSupabase } from '$lib/supabase';
  import type { PreviewRoleClaimResult, CheckMySessionResult, ClaimRoleResult } from '$shared/types/api';

  const { gameToken, roleToken } = $derived($page.params);

  // ──────────────────────────────────────────────────────────────────────────
  // Page state
  // Use `pageState` (not `state`) to avoid Svelte 4 store shorthand ambiguity.
  // ──────────────────────────────────────────────────────────────────────────
  type PageState =
    | { phase: 'loading' }
    | { phase: 'unconfigured' }
    | { phase: 'invalid'; reason: string }
    | { phase: 'locked' }
    | { phase: 'claim'; preview: PreviewRoleClaimResult }
    | { phase: 'restore'; preview: PreviewRoleClaimResult; claimedByName: string | null }
    | { phase: 'submitting' }
    | { phase: 'error'; message: string }
    | { phase: 'done'; result: ClaimRoleResult };

  let pageState = $state<PageState>({ phase: 'loading' });
  let displayName = $state('');

  onMount(async () => {
    const supabase = getSupabase();
    if (!supabase) { pageState = { phase: 'unconfigured' }; return; }

    // 1. Preview (anon-callable) — fetch public role info while we sort auth.
    const previewPromise = (supabase as any).rpc('preview_role_claim', {
      p_game_token: gameToken,
      p_role_token: roleToken,
    }) as Promise<{ data: PreviewRoleClaimResult[] | null; error: unknown }>;

    // 2. Anon sign-in runs in parallel.
    const authPromise = supabase.auth.signInAnonymously();

    const [previewRes, authRes] = await Promise.all([previewPromise, authPromise]);

    if (previewRes.error) {
      pageState = { phase: 'error', message: String((previewRes.error as any).message ?? previewRes.error) };
      return;
    }
    if (!previewRes.data || previewRes.data.length === 0) {
      pageState = { phase: 'invalid', reason: 'Badge QR not recognised. Check the session is live and the badge has been generated.' };
      return;
    }
    const preview = previewRes.data[0] as PreviewRoleClaimResult;

    if (authRes.error) {
      pageState = { phase: 'error', message: 'Sign-in failed: ' + authRes.error.message };
      return;
    }

    if (preview.is_locked) { pageState = { phase: 'locked' }; return; }

    // 3. Now authenticated — check if this device already has this role.
    const checkRes = await (supabase as any).rpc('check_my_session', {
      p_game_token: gameToken,
      p_role_token: roleToken,
    }) as { data: CheckMySessionResult[] | null; error: unknown };

    if (!checkRes.error && checkRes.data && checkRes.data.length > 0) {
      const check = checkRes.data[0] as CheckMySessionResult;
      if (check.already_mine && check.participant_id && check.game_session_id) {
        // Already our session on this device — go straight to play.
        await goto(`/play/g/${check.game_session_id}/r/${check.participant_id}`);
        return;
      }
    }

    if (preview.is_claimed) {
      pageState = { phase: 'restore', preview, claimedByName: preview.claimed_by_name };
    } else {
      pageState = { phase: 'claim', preview };
    }
  });

  async function handleClaim() {
    if (pageState.phase !== 'claim') return;
    const name = displayName.trim();
    if (!name) return;
    const claimPreview = pageState.preview;
    pageState = { phase: 'submitting' };

    const supabase = getSupabase();
    if (!supabase) { pageState = { phase: 'unconfigured' }; return; }

    const { data, error } = await (supabase as any).rpc('claim_role', {
      p_game_token: gameToken,
      p_role_token: roleToken,
      p_display_name: name,
      p_device_label: navigator.userAgent.slice(0, 120),
    }) as { data: ClaimRoleResult[] | null; error: { code?: string; message: string } | null };

    if (error) {
      if (error.code === 'P0004' || error.message?.includes('role_already_claimed')) {
        pageState = { phase: 'restore', preview: claimPreview, claimedByName: null };
      } else {
        pageState = { phase: 'error', message: error.message };
      }
      return;
    }
    if (!data || data.length === 0) { pageState = { phase: 'error', message: 'Claim returned no result.' }; return; }
    const result = data[0] as ClaimRoleResult;
    pageState = { phase: 'done', result };
    await goto(`/play/g/${result.game_session_id}/r/${result.participant_id}`);
  }

  async function handleRestore() {
    if (pageState.phase !== 'restore') return;
    pageState = { phase: 'submitting' };

    const supabase = getSupabase();
    if (!supabase) { pageState = { phase: 'unconfigured' }; return; }

    const { data, error } = await (supabase as any).rpc('restore_role', {
      p_game_token: gameToken,
      p_role_token: roleToken,
      p_device_label: navigator.userAgent.slice(0, 120),
    }) as { data: ClaimRoleResult[] | null; error: { code?: string; message: string } | null };

    if (error) {
      // Show the locked UI for role_locked error, consistent with handleClaim.
      if (error.code === 'P0003' || error.message?.includes('role_locked')) {
        pageState = { phase: 'locked' };
      } else {
        pageState = { phase: 'error', message: error.message };
      }
      return;
    }
    if (!data || data.length === 0) { pageState = { phase: 'error', message: 'Restore returned no result.' }; return; }
    const result = data[0] as ClaimRoleResult;
    pageState = { phase: 'done', result };
    await goto(`/play/g/${result.game_session_id}/r/${result.participant_id}`);
  }
</script>

<svelte:head>
  {#if pageState.phase === 'claim'}
    <title>Claim role · {pageState.preview.faction_name} {pageState.preview.role_name} · Crisis: Mars</title>
  {:else if pageState.phase === 'restore'}
    <title>Restore access · {pageState.preview.faction_name} {pageState.preview.role_name} · Crisis: Mars</title>
  {:else}
    <title>Join · Crisis: Mars</title>
  {/if}
</svelte:head>

{#if pageState.phase === 'loading' || pageState.phase === 'submitting' || pageState.phase === 'done'}
  <div class="center">
    <div class="spinner" aria-label="Loading"></div>
    <p class="loading-text">
      {#if pageState.phase === 'loading'}Checking badge…
      {:else if pageState.phase === 'submitting'}Just a moment…
      {:else}Entering game…
      {/if}
    </p>
  </div>

{:else if pageState.phase === 'unconfigured'}
  <div class="card warn">
    <h1>Not configured</h1>
    <p>The app is not connected to a database. Ask a facilitator for help.</p>
  </div>

{:else if pageState.phase === 'invalid'}
  <div class="card warn">
    <h1>Badge not recognised</h1>
    <p>{pageState.reason}</p>
    <p><a href="/join">&larr; Back</a></p>
  </div>

{:else if pageState.phase === 'locked'}
  <div class="card warn">
    <h1>Badge locked</h1>
    <p>This badge has been locked by a facilitator. Ask them to unlock or reissue it.</p>
    <p><a href="/join">&larr; Back</a></p>
  </div>

{:else if pageState.phase === 'error'}
  <div class="card warn">
    <h1>Something went wrong</h1>
    <p><code>{pageState.message}</code></p>
    <p>Try scanning the badge again. If the problem persists, ask a facilitator.</p>
    <p><a href="/join">&larr; Back</a></p>
  </div>

{:else if pageState.phase === 'claim'}
  {@const p = pageState.preview}
  <div class="card" style:--faction-colour={p.faction_colour}>
    <div class="faction-bar">
      <span class="faction-name">{p.faction_name}</span>
      <span class="role-code">{p.role_code}</span>
    </div>
    <h1 class="role-name">{p.role_name}</h1>
    <p class="public-desc">{p.public_description}</p>

    <p class="claim-prompt">You are about to claim this role.</p>

    <label class="name-label" for="display-name">Your name</label>
    <input
      id="display-name"
      class="name-input"
      type="text"
      placeholder="Enter your name"
      maxlength="40"
      bind:value={displayName}
      onkeydown={(e) => e.key === 'Enter' && displayName.trim() && handleClaim()}
      autocomplete="off"
    />

    <button class="btn-primary" onclick={handleClaim} disabled={!displayName.trim()}>
      Confirm — I am {p.role_name}
    </button>
    <p class="privacy-hint">Your private role brief will be shown after you confirm.</p>
  </div>

{:else if pageState.phase === 'restore'}
  {@const p = pageState.preview}
  <div class="card" style:--faction-colour={p.faction_colour}>
    <div class="faction-bar">
      <span class="faction-name">{p.faction_name}</span>
      <span class="role-code">{p.role_code}</span>
    </div>
    <h1 class="role-name">{p.role_name}</h1>

    <div class="restore-info">
      {#if pageState.claimedByName}
        <p>This role has already been claimed by <strong>{pageState.claimedByName}</strong>.</p>
      {:else}
        <p>This role has already been claimed.</p>
      {/if}
      <p>If that is you, tap <strong>Restore access</strong> to re-open the game on this device.</p>
      <p>If someone else accidentally scanned your badge, ask a facilitator to reset it.</p>
    </div>

    <button class="btn-primary" onclick={handleRestore}>
      Restore access — {p.role_name}
    </button>
    <p><a href="/join">&larr; Not me</a></p>
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

  .card {
    --faction-colour: #2a3641;
    background: #2a3641;
    border: 1px solid #3a4855;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0 0 1.5rem;
  }
  .card.warn {
    padding: 1.5rem;
    border-color: #ffb86b;
    background: rgba(255, 184, 107, 0.08);
  }
  .card.warn h1 { margin: 0 0 0.5rem; }
  .card.warn code {
    background: #14202a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em;
  }

  .faction-bar {
    background: var(--faction-colour);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.25rem;
  }
  .faction-name {
    font-weight: 700;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .role-code {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.8rem;
    background: rgba(0,0,0,0.2);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  .role-name {
    margin: 0.5rem 1.25rem 0;
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .public-desc {
    margin: 0 1.25rem;
    color: #c2cdd6;
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .claim-prompt {
    margin: 0.5rem 1.25rem 0;
    color: #c2cdd6;
  }
  .name-label {
    display: block;
    margin: 0 1.25rem 0.25rem;
    font-size: 0.85rem;
    color: #95a3b1;
  }
  .name-input {
    margin: 0 1.25rem;
    padding: 0.65rem 0.9rem;
    background: #14202a;
    border: 1px solid #3a4855;
    border-radius: 8px;
    color: #f7f9fb;
    font-size: 1rem;
    width: calc(100% - 2.5rem);
    box-sizing: border-box;
  }
  .name-input:focus {
    outline: none;
    border-color: #ffb86b;
  }
  .btn-primary {
    margin: 0.5rem 1.25rem 0;
    padding: 0.8rem 1rem;
    background: #ffb86b;
    color: #1f2933;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 120ms;
  }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { opacity: 0.9; }
  .privacy-hint {
    margin: 0 1.25rem;
    color: #95a3b1;
    font-size: 0.8rem;
  }
  .restore-info {
    margin: 0 1.25rem;
    color: #c2cdd6;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .restore-info p { margin: 0; }
</style>
