<script lang="ts">
  import { isSupabaseConfigured } from '$lib/supabase';

  const configured = isSupabaseConfigured();
</script>

<svelte:head>
  <title>Crisis: Mars</title>
  <meta
    name="description"
    content="Web runner for the Crisis: Mars megagame. Scan a role badge to join, or open the facilitator dashboard."
  />
</svelte:head>

<section class="hero">
  <h1>Crisis: Mars</h1>
  <p class="lede">
    The year is 2241. The Martian Senate has declared independence and Earth is mobilising for war.
    This web runner supports the in-room megagame; you still negotiate face to face.
  </p>
</section>

<section class="actions">
  <a class="action-card primary" href="/join">
    <h2>I have a role badge</h2>
    <p>Scan the QR on the back of your badge to claim or rejoin your role.</p>
  </a>
  <a class="action-card" href="/facilitator">
    <h2>I am a facilitator</h2>
    <p>Open the facilitator dashboard to create or run a session.</p>
  </a>
</section>

{#if !configured}
  <aside class="warn">
    <strong>Backend not configured.</strong>
    Set <code>PUBLIC_SUPABASE_URL</code> and <code>PUBLIC_SUPABASE_ANON_KEY</code> in
    <code>.env</code>, then restart the dev server. See <code>README.md</code>.
  </aside>
{/if}

<section class="meta">
  <h3>Foundations build</h3>
  <p>
    This is the scaffolding only. Session creation, role claim, timers, maps, and resource cards
    are not yet wired up. See the spec's section 27 <em>Build Priority</em> for the roadmap.
  </p>
</section>

<style>
  .hero {
    margin-bottom: 2rem;
  }
  .hero h1 {
    margin: 0 0 0.25rem;
    font-size: 2.5rem;
    letter-spacing: -0.02em;
  }
  .lede {
    color: #c2cdd6;
    font-size: 1.05rem;
    line-height: 1.5;
    margin: 0;
  }

  .actions {
    display: grid;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .action-card {
    display: block;
    padding: 1.25rem 1.25rem 1.5rem;
    background: #2a3641;
    border: 1px solid #3a4855;
    border-radius: 12px;
    color: inherit;
    text-decoration: none;
    transition:
      transform 120ms ease,
      border-color 120ms ease;
  }
  .action-card:hover,
  .action-card:focus {
    transform: translateY(-2px);
    border-color: #ffb86b;
    outline: none;
  }
  .action-card.primary {
    background: linear-gradient(135deg, #1f3a5a, #2a3641);
  }
  .action-card h2 {
    margin: 0 0 0.25rem;
    font-size: 1.15rem;
  }
  .action-card p {
    margin: 0;
    color: #c2cdd6;
  }

  .warn {
    margin: 1.5rem 0;
    padding: 1rem;
    border: 1px solid #ffb86b;
    background: rgba(255, 184, 107, 0.1);
    border-radius: 8px;
    color: #ffe0b2;
  }
  .warn code {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .meta {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #2d3a45;
    color: #95a3b1;
  }
  .meta h3 {
    margin: 0 0 0.5rem;
    color: #c2cdd6;
  }
  .meta p {
    margin: 0;
    line-height: 1.5;
  }
</style>
