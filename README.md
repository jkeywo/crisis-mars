# Crisis: Mars Web Runner

Free-hosted web app for running the *Crisis: Mars* megagame: maps, roles, action cards,
resource cards, timers, and facilitator control. See
[`crisis_mars_web_runner_spec.md`](./crisis_mars_web_runner_spec.md) for the full
specification.

## Status

Foundations only. The repo scaffolding, scenario data, database schema, and a static
PWA shell are in place. Game features (session creation, role claim, timers, maps,
cards) are not yet implemented. See the spec's section 27 "Build Priority" for the
roadmap.

## Repo layout

```
crisis_mars_web_runner_spec.md   Canonical product/architecture spec
game_files/                       Reference materials (PDFs, source XLSX, image assets)
scenario/                         Canonical scenario data + JSON Schema
supabase/                         Postgres schema, RLS, seed
packages/
  shared/                         Cross-package TS types and constants
  web/                            SvelteKit static PWA
scripts/                          Build-time helpers (validate scenario, seed DB)
docs/                             Architecture overview + ADRs
```

## Stack

- **Frontend:** SvelteKit + `@sveltejs/adapter-static`, deployed as a static PWA
  (Cloudflare Pages / Netlify / GitHub Pages target).
- **Backend:** Supabase (Postgres + Realtime + Storage + RLS). Anonymous JWTs scoped
  to a session + participant; no email/password accounts for players.
- **Package manager:** npm workspaces.
- **Language:** TypeScript, strict.
- **Linting/formatting:** ESLint (per package) + Prettier (root).

See [`docs/architecture.md`](./docs/architecture.md) and the ADRs in
[`docs/decisions/`](./docs/decisions/) for the rationale.

## Prerequisites

- Node.js >= 20
- npm >= 10
- [Supabase CLI](https://supabase.com/docs/guides/cli) (Docker required for local dev)

## Quick start

```bash
# Install dependencies
npm install

# Validate that scenario/crisis-mars-v1.json conforms to the schema
npm run scenario:validate

# Bring up local Supabase (Postgres, Auth, Realtime, Storage)
npm run db:start

# Apply migrations and seed the scenario tables
npm run db:reset

# Regenerate TypeScript types from the live local DB
npm run db:types

# Start the SvelteKit dev server
# Copy the env template (PowerShell `Copy-Item` or POSIX `cp`).
# Edit .env with the values printed by `supabase status`.
npm run dev
```

## Create a game session

Session creation is a CLI operation: it requires the operator-only service-role
key, so it cannot live in the browser. Run from the repo root with a local
Supabase up and the scenario seeded:

```bash
npm run session:create -- --title "Friday night playtest"
```

The script generates three unguessable tokens, calls the `create_game_session`
Postgres RPC (which stores only the SHA-256 hashes of the tokens), and prints
three URLs:

- **Facilitator URL** - give to facilitators only. Opens the read-only
  dashboard at `/facilitator/<token>`.
- **Join URL** - hand to players (step 6 wires up the claim flow).
- **Observer URL** - optional read-only view (later step).

These URLs are shown ONCE. Save them; they cannot be retrieved. Re-run the
script to create a new session.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | SvelteKit dev server (`packages/web`). |
| `npm run build` | Build every package; web outputs to `packages/web/build/`. |
| `npm run typecheck` | TypeScript across the workspace. |
| `npm run lint` | ESLint per package. |
| `npm run format` | Prettier write across the repo. |
| `npm run scenario:validate` | AJV-validate `scenario/crisis-mars-v1.json` against `scenario/schema.json`. |
| `npm run icons:generate` | Regenerate the placeholder PWA icons under `packages/web/static/icons/`. |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local stack. |
| `npm run db:types` | Regenerate `packages/shared/src/types/database.ts`. |
| `npm run db:seed` | Load scenario JSON into a running DB (uses the service-role key). |
| `npm run session:create -- --title "..."` | Create a game session and print the three URLs. |

## Where to look first

- Spec sections 24 and 22 map to `supabase/migrations/0001_init.sql` and `0002_rls.sql`.
- Spec section 5 (factions, roles, NPCs) and section 10 (cards) map to
  `scenario/crisis-mars-v1.json`, which is the source of truth for game content.
- Spec section 3 (architecture) maps to `docs/decisions/0001-frontend-sveltekit.md`
  and `docs/decisions/0002-backend-supabase.md`.

## Reporting and feedback

Open an issue on the project tracker. Spec questions belong on the spec itself; code
questions belong here.
