# Architecture overview

This is the operating model for the Crisis: Mars web runner. For the product
intent see [`../crisis_mars_web_runner_spec.md`](../crisis_mars_web_runner_spec.md).

## One picture

```
+--------------------+        +-------------------------+
|  Player browser    |        |  Facilitator browser    |
|  (SvelteKit SPA,   |        |  (same SPA, different   |
|   service worker,  |        |   route + JWT claims)   |
|   Cache API shell, |        +-----------+-------------+
|   IndexedDB later) |                    |
+--------+-----------+                    |
         |                                |
         |   HTTPS (PostgREST + Realtime + Storage)
         v                                v
+-----------------------------------------------+
|                  Supabase                     |
|   +----------+  +------------+  +---------+   |
|   | Postgres |  | Realtime   |  | Storage |   |
|   |  + RLS   |  | (WebSocket)|  |         |   |
|   +----+-----+  +-----+------+  +----+----+   |
|        |              |              |        |
|        v              v              v        |
|     Authoritative game state, audit, assets   |
+-----------------------------------------------+
```

Today the client only caches the app shell via the Cache API in
`src/service-worker.ts`. Spec section 23 also calls for cached rules, briefs,
maps, hand, and last-known scores; those land in IndexedDB during build-priority
steps 7 (briefs) and 10 (maps).

## Source-of-truth boundary

Supabase Postgres is the single source of truth for everything that matters to
play: scores, card holders, action placements, timer, phase, audit. The browser
keeps a thin local cache for offline reading (spec section 23) but the server
arbitrates every mutation.

This is why every state-changing operation is implemented (or will be) as a
`SECURITY DEFINER` Postgres function in `supabase/migrations/0003_functions.sql`
rather than as a direct table write. The function performs:

1. Authorisation against JWT claims.
2. Pre-condition checks.
3. The state change.
4. An audit insert.

Direct `INSERT/UPDATE/DELETE` from the client is closed off by RLS for any table
that is not a self-only update (e.g. `participant.last_seen_at`).

## Frontend

- **SvelteKit 5** with `@sveltejs/adapter-static`. Pre-renders the shell at build
  time and ships an SPA fallback (`build/index.html`). See
  [`docs/decisions/0001-frontend-sveltekit.md`](./decisions/0001-frontend-sveltekit.md).
- **Free hosting target:** Cloudflare Pages, Netlify, or GitHub Pages all accept
  the `packages/web/build` output directly.
- **Service worker** at `src/service-worker.ts` caches the app shell so the SPA
  loads while offline. Data caching (rules text, last-known scores) plugs into
  this later.
- **Routes** live under `src/routes`:
  - `/` landing
  - `/join` and (later) `/join/g/:game/r/:role` for QR claim/rejoin (spec 6.2)
  - `/facilitator` and (later) `/facilitator/:token` for the dashboard
- **PWA manifest** at `static/manifest.webmanifest`. Icons in `static/icons/`
  (placeholders for now).

## Backend

- **Supabase** for Postgres, Realtime, Auth, and Storage. See
  [`docs/decisions/0002-backend-supabase.md`](./decisions/0002-backend-supabase.md).
- **Schema** in `supabase/migrations/0001_init.sql`, one-to-one with spec
  section 24.
- **RLS** in `supabase/migrations/0002_rls.sql`, mapping spec section 22.
- **Auth model:** anonymous Supabase Auth. The role-claim flow mints an
  anonymous JWT carrying `game_session_id`, `participant_id`, and
  `permission_level` as custom claims. RLS reads these via helper functions
  (`jwt_session_id()`, etc.) defined in `0002_rls.sql`.
- **Realtime channels** track the list in spec section 21. Subscribed only when
  a participant needs them, to stay inside the free tier.

## Scenario data

- `scenario/crisis-mars-v1.json` is the canonical content. Derived from
  `game_files/Crisis Mars v1.0 Data.xlsx` (factions, roles, resource decks, NPCs)
  and from the spec (maps, score tracks, locations, war correspondence,
  schedule).
- `scenario/schema.json` (JSON Schema) shape-validates the data.
- `scripts/validate-scenario.mjs` adds cross-reference checks JSON Schema
  cannot express (faction IDs in roles, role codes in card templates, starting
  card counts).
- `scripts/seed-from-scenario.mjs` loads the JSON into the static tables. It
  uses the SERVICE_ROLE key and is never bundled into the client.

## Tokens (spec section 28.1)

Six distinct token types, kept apart by design. See
[`docs/decisions/0003-token-separation.md`](./decisions/0003-token-separation.md).

| Token | Stored as | Lifetime | Owner |
|---|---|---|---|
| Game join | URL fragment + `game_session.join_code_hash` | Game | Facilitator |
| Facilitator | Separate URL + `game_session.facilitator_code_hash` | Game | Facilitator |
| Role badge | URL fragment + `role_access_token.token_hash` | Game | Per role |
| Manual role code | `role_access_token.manual_code_hash` | Game | Per role (fallback) |
| Resource card | `card_instance.qr_token_hash` | Game | Per physical card |
| Trade | `trade_event.trade_token_hash` | Seconds | Per proposed trade |

## Packages and scripts

| Path | Purpose |
|---|---|
| `packages/web` | SvelteKit static PWA. `npm run dev`, `npm run build`. |
| `packages/shared` | Cross-package TS types and enum constants kept in sync with the SQL. |
| `scripts/validate-scenario.mjs` | AJV validation of `scenario/crisis-mars-v1.json`. |
| `scripts/seed-from-scenario.mjs` | Load scenario JSON into Supabase via the service role. |
| `supabase/migrations/0001_init.sql` | Tables, enums, indexes for spec section 24. |
| `supabase/migrations/0002_rls.sql` | Row-Level Security policies for spec section 22. |
| `supabase/migrations/0003_functions.sql` | Placeholder for `SECURITY DEFINER` RPCs. |

## What is not here yet

- Session creation flow (build-priority step 4).
- Role badge QR generation and printing (step 5).
- Role claim/rejoin RPCs and UI (step 6).
- Brief viewer (step 7).
- Facilitator casting dashboard (step 8).
- Timer / phase manager and Realtime subscriptions (step 9).
- Map dashboards and score editing (steps 10-11).
- Anything in MVP 2-6 from the spec.

This file is the index. When something is added, link to it from here.
