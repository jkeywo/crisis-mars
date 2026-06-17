<script lang="ts">
  // Placeholder. Phase 6 of the build priority introduces the QR scanner and the
  // /join/g/{gameToken}/r/{roleToken} URL shape from spec section 6.2.
</script>

<svelte:head>
  <title>Join a game &middot; Crisis: Mars</title>
</svelte:head>

<h1>Join a game</h1>

<p>
  Scan the QR code on the back of your role badge. The badge will direct you to a URL like
  <code>/join/g/&lt;gameToken&gt;/r/&lt;roleToken&gt;</code>, which is not yet wired up in this
  foundations build.
</p>

<p>
  If your badge QR is damaged, ask a facilitator for the short manual unlock code printed beneath
  the QR.
</p>

<p class="back"><a href="/">&larr; Back</a></p>

<style>
  h1 {
    margin: 0 0 1rem;
  }
  code {
    background: #14202a;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }
  .back {
    margin-top: 2rem;
  }
</style>
