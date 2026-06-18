<script lang="ts">
  // /join landing page. Players arrive here if:
  //   a) They open the app without scanning a QR (no route params).
  //   b) Their QR scanner sends them here without the full /g/:game/r/:role path.
</script>

<svelte:head>
  <title>Join a game &middot; Crisis: Mars</title>
</svelte:head>

<h1>Join a game</h1>

<section class="block">
  <h2>Scan your role badge</h2>
  <p>
    Point your phone camera at the QR code on the <strong>back</strong> of your role badge. Your
    browser will open directly to the role claim page.
  </p>
  <p>The QR code links to a URL like:</p>
  <pre><code>/join/g/&lt;gameToken&gt;/r/&lt;roleToken&gt;</code></pre>
</section>

<section class="block">
  <h2>QR not working?</h2>
  <p>
    If the QR is damaged or your camera can't read it, use the <strong>manual code</strong> printed
    below the QR on your badge. Ask a facilitator to verify the game join URL and enter:
  </p>
  <ol>
    <li>The join URL printed by the facilitator when they ran <code>session:create</code>.</li>
    <li>Your 6-character role code (e.g. <code>G7K-NR2</code>) from the badge back.</li>
  </ol>
  <p class="hint">
    Manual code entry is not yet wired in this build. Ask a facilitator to scan your badge
    for you or enter the full URL manually.
  </p>
</section>

<p class="back"><a href="/">&larr; Back</a></p>

<style>
  h1 { margin: 0 0 1.5rem; }
  h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .block { margin: 0 0 2rem; }
  code {
    background: #14202a;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.9em;
  }
  pre { background: #14202a; padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  ol { padding-left: 1.25rem; line-height: 1.7; }
  .hint { color: #95a3b1; font-size: 0.875rem; }
  .back { margin-top: 2rem; }
</style>
