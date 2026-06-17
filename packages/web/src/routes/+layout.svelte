<script lang="ts">
  import { isOnline } from '$lib/stores/connection';
  import { isSupabaseConfigured } from '$lib/supabase';

  let { children } = $props();
  const configured = isSupabaseConfigured();
</script>

<div class="app">
  <header class="app-header">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-text">Crisis: Mars</span>
    </a>
    <div class="status" aria-live="polite">
      {#if !$isOnline}
        <span class="status-pill status-offline" role="status">Offline</span>
      {/if}
      {#if !configured}
        <span class="status-pill status-warn" role="status">Backend not configured</span>
      {/if}
    </div>
  </header>

  <main class="app-main">
    {@render children()}
  </main>

  <footer class="app-footer">
    <small>Crisis: Mars web runner &mdash; foundations build, not yet a live game.</small>
  </footer>
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #1f2933;
    color: #f7f9fb;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      sans-serif;
    min-height: 100vh;
  }

  :global(a) {
    color: #ffb86b;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: #14202a;
    border-bottom: 1px solid #2d3a45;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: inherit;
    text-decoration: none;
    font-weight: 600;
  }

  .brand-mark {
    display: inline-block;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: #d6371e;
    box-shadow: inset -0.25rem -0.15rem 0 rgba(0, 0, 0, 0.25);
  }

  .status {
    display: flex;
    gap: 0.5rem;
  }

  .status-pill {
    display: inline-block;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-offline {
    background: #b3261e;
    color: #fff;
  }

  .status-warn {
    background: #ffb86b;
    color: #1f2933;
  }

  .app-main {
    flex: 1;
    padding: 1.5rem 1rem 3rem;
    max-width: 48rem;
    width: 100%;
    margin: 0 auto;
  }

  .app-footer {
    padding: 1rem;
    text-align: center;
    color: #95a3b1;
    border-top: 1px solid #2d3a45;
    background: #14202a;
  }
</style>
