<script lang="ts">
  // Placeholder. The facilitator dashboard is introduced in build priority steps
  // 4, 8, 9, 10 etc. For now this page just confirms the route is live.
</script>

<svelte:head>
  <title>Facilitator &middot; Crisis: Mars</title>
</svelte:head>

<h1>Facilitator</h1>

<p>
  The facilitator dashboard is not yet implemented in this foundations build. When it lands it
  will live here and accept a facilitator link of the form
  <code>/facilitator/&lt;facilitatorToken&gt;</code>.
</p>

<p>For now you can:</p>
<ul>
  <li>Apply the database migrations with <code>npm run db:reset</code>.</li>
  <li>Seed the scenario tables with <code>npm run db:seed</code>.</li>
  <li>Inspect the data in Supabase Studio at <code>http://127.0.0.1:54323</code>.</li>
</ul>

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
