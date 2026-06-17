<script lang="ts">
  import { isSupabaseConfigured } from '$lib/supabase';

  const configured = isSupabaseConfigured();
</script>

<svelte:head>
  <title>Facilitator &middot; Crisis: Mars</title>
</svelte:head>

<h1>Facilitator</h1>

<p>
  Session creation runs from the operator's machine using the service-role key. There is no
  in-browser "create session" button until the JWT issuer lands in build-priority step 6.
</p>

<h2>Create a session</h2>

<pre><code>npm run session:create -- --title "Friday night playtest"</code></pre>

<p>
  The script generates three unguessable tokens, calls <code>create_game_session</code> in
  Postgres (which stores only SHA-256 hashes of the tokens), and prints three URLs:
</p>

<ul>
  <li><strong>Facilitator URL</strong> &mdash; opens the read-only dashboard at <code>/facilitator/&lt;token&gt;</code>.</li>
  <li><strong>Join URL</strong> &mdash; for players (claim flow lands in step 6).</li>
  <li><strong>Observer URL</strong> &mdash; optional read-only view.</li>
</ul>

<p>
  The URLs print once. Save them. Re-run the script to create another session. See the README
  "Create a game session" section for details and the available flags.
</p>

<h2>Open an existing dashboard</h2>

<p>
  Paste the facilitator URL printed by <code>session:create</code> directly into the address bar.
  It looks like <code>/facilitator/&lt;facilitatorToken&gt;</code>.
</p>

{#if !configured}
  <aside class="warn">
    <strong>Backend not configured.</strong>
    Set <code>PUBLIC_SUPABASE_URL</code> and <code>PUBLIC_SUPABASE_ANON_KEY</code> in
    <code>.env</code>, then restart the dev server.
  </aside>
{/if}

<p class="back"><a href="/">&larr; Back</a></p>

<style>
  h1 {
    margin: 0 0 1rem;
  }
  h2 {
    margin: 2rem 0 0.5rem;
    font-size: 1.1rem;
  }
  code {
    background: #14202a;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }
  pre {
    background: #14202a;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    overflow-x: auto;
  }
  pre code {
    background: transparent;
    padding: 0;
  }
  .warn {
    margin: 1.5rem 0;
    padding: 1rem;
    border: 1px solid #ffb86b;
    background: rgba(255, 184, 107, 0.1);
    border-radius: 8px;
    color: #ffe0b2;
  }
  .back {
    margin-top: 2rem;
  }
</style>
