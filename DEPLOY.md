# Crisis: Mars — Deployment Guide

This guide takes you from zero infrastructure to a live facilitator dashboard
at a public URL. After following it:

- A hosted Supabase project holds the game data and serves the API.
- The web app is hosted on Cloudflare Pages, deployed automatically on every
  push to `main`.
- A facilitator can run `npm run session:create` to create a game session and
  get three URLs.

**Time to complete:** ~30 minutes (mostly waiting for platform UIs to load).

---

## Prerequisites

Installed on your machine:

- Node.js ≥ 20, npm ≥ 10
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)
  (`brew install supabase/tap/supabase` or see the link)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
  (optional – the GitHub Actions workflow handles deploys, but useful to test
  locally)

Accounts:

- [Supabase](https://supabase.com) (free tier is sufficient)
- [Cloudflare](https://dash.cloudflare.com) (free tier is sufficient)
- GitHub (you already have this; the repo is at
  https://github.com/jkeywo/crisis-mars)

---

## Part 1 — Supabase hosted project

### 1.1 Create the project

1. Go to [app.supabase.com](https://app.supabase.com) and sign in.
2. Click **New project**.
3. Choose an organisation, set a project name (`crisis-mars` is a good choice),
   choose a region close to where the game will be played, set a database
   password (save it somewhere safe), and click **Create new project**.
4. Wait for the project to initialise (~2 minutes).

### 1.2 Note your credentials

From **Project Settings → API** note:

| Value | Where you'll use it |
|---|---|
| **Project URL** (e.g. `https://abcdefgh.supabase.co`) | `PUBLIC_SUPABASE_URL` everywhere |
| **`anon` public key** | `PUBLIC_SUPABASE_ANON_KEY` (safe to put in the client) |
| **`service_role` secret key** | `SUPABASE_SERVICE_ROLE_KEY` (never in the client) |

From **Project Settings → General** note:

| Value | Where you'll use it |
|---|---|
| **Reference ID** (short alphanumeric, e.g. `abcdefgh`) | `supabase link --project-ref` |

### 1.3 Enable anonymous sign-ins

1. In your Supabase project, go to **Authentication → Configuration**.
2. Under **User sign up**, enable **"Allow anonymous sign-ins"**.
3. Set the **Site URL** to your production domain (you'll know this after
   Part 2; come back and update it). For now set it to
   `https://crisis-mars.pages.dev` as a placeholder.
4. Click **Save**.

> This cannot be done by `supabase db push` — it is an Auth setting, not a
> migration. It must be done in the dashboard.

### 1.4 Apply migrations and seed data

In your local repo:

```bash
# Authenticate the Supabase CLI to the hosted project.
supabase login          # opens a browser
supabase link --project-ref <reference-id>

# Apply all three migrations to the hosted project.
# This is safe to re-run; it only applies new migrations.
supabase db push
```

Confirm success with:

```bash
supabase db diff --linked   # should show no pending changes
```

Create a `.env` file at the repo root (copy from the example, never commit it):

```bash
cp .env.example .env
# edit .env and fill in the values:
#   PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
#   PUBLIC_SUPABASE_ANON_KEY=<anon-key>
#   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Seed the scenario data (this is idempotent — safe to re-run):

```bash
npm run db:seed
```

Verify (optional):

```bash
supabase inspect db table-sizes --linked
# Should show scenario, faction, role, map, card_template, etc. with row counts
```

---

## Part 2 — Cloudflare Pages

### 2.1 Create a Pages project

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com) and select
   your account.
2. Navigate to **Workers & Pages → Create application → Pages**.
3. Choose **Connect to Git**.
4. Authorise Cloudflare to access your GitHub account.
5. Select the `jkeywo/crisis-mars` repository.
6. Click **Begin setup**.

### 2.2 Configure build settings

| Setting | Value |
|---|---|
| Project name | `crisis-mars` (matches `projectName` in `.github/workflows/deploy.yml`) |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `packages/web/build` |
| Root directory | *(leave blank — root of the repo)* |

> **Important:** Cloudflare's built-in build runner is optional here. The
> GitHub Actions workflow in `.github/workflows/deploy.yml` uses
> `cloudflare/pages-action` to do a **direct upload** of the pre-built
> `packages/web/build/` directory. If you want Cloudflare to do the build
> instead (simpler), that also works with the settings above.

### 2.3 Add environment variables

In the Pages project → **Settings → Environment variables**, add:

| Variable | Value | Environment |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Production (and Preview) |
| `PUBLIC_SUPABASE_ANON_KEY` | `<anon-key>` | Production (and Preview) |

> These are `PUBLIC_` variables and are safe to put in the build environment.
> They end up in `_app/env.js` in the built bundle. Do NOT add
> `SUPABASE_SERVICE_ROLE_KEY` here — that key is only for operator scripts run
> locally or in a trusted CI environment, never in the client build.

### 2.4 First deploy

Click **Save and deploy**. Cloudflare will build and deploy. After a few
minutes it will show a deployment URL like:

```
https://crisis-mars.pages.dev
```

or a custom domain if you set one up.

Now go back to Supabase → Authentication → Configuration and update the
**Site URL** to this production URL.

---

## Part 3 — GitHub Actions secrets (for automated deploys on push)

The `.github/workflows/deploy.yml` workflow uses `cloudflare/pages-action` to
deploy from CI. It needs four GitHub Actions secrets.

### 3.1 Get the Cloudflare credentials

1. In the Cloudflare dashboard → **My Profile → API Tokens → Create Token**.
2. Use the **"Cloudflare Pages: Edit" template** (or create a custom token
   with permissions: `Account - Cloudflare Pages - Edit`).
3. Note the **API Token**.
4. Note your **Account ID** from the Cloudflare dashboard sidebar (under your
   account name).

### 3.2 Add secrets to GitHub

Go to `https://github.com/jkeywo/crisis-mars/settings/secrets/actions` and add:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | The API token from step 3.1 |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | `<anon-key>` |

After adding these, every push to `main` will:

1. Run `npm run scenario:validate`.
2. Run `npm run typecheck`.
3. Run `npm run build` with the Supabase env vars baked in.
4. Upload `packages/web/build/` to Cloudflare Pages.

---

## Part 4 — Create a game session

Once the app is live:

```bash
# From the repo root, with .env set to the HOSTED Supabase project:
npm run session:create -- \
  --title "Friday night playtest" \
  --base-url https://crisis-mars.pages.dev
```

The script prints three URLs:

```
Facilitator: https://crisis-mars.pages.dev/facilitator/<facilitatorToken>
Join:        https://crisis-mars.pages.dev/join/g/<joinToken>
Observer:    https://crisis-mars.pages.dev/observe/<observerToken>
```

**These are shown once. Save them.**

- Hand the **Facilitator URL** to facilitators only.
- Hand the **Join URL** to players (the join flow is not yet wired — it lands
  in build-priority step 6).
- Keep the **Observer URL** for spectators (also not yet wired).

The facilitator opens their URL and sees the read-only session dashboard:
session title, turn/phase status, two NPC cards, and all 20 score tracks at
their starting values.

---

## Subsequent deploys

After the initial setup, deployment is fully automatic:

1. Push code to `main` on GitHub.
2. GitHub Actions runs, builds, and deploys to Cloudflare Pages.
3. The new build is live in ~2 minutes.

Scenario data changes (editing `scenario/crisis-mars-v1.json`) require a
manual re-seed:

```bash
npm run db:seed    # idempotent — safe to re-run
```

Schema changes (new migrations in `supabase/migrations/`) require:

```bash
supabase db push   # applies only new migrations
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App shows "Backend not configured" | `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` not set at build time | Add the secrets to GitHub Actions (Part 3) and trigger a new deployment. |
| `/facilitator/<token>` shows 404 | SPA fallback not configured | Cloudflare Pages serves `200.html` for unmatched routes automatically. If you moved to another host, check the SPA fallback notes in `packages/web/svelte.config.js`. |
| `session:create` fails with "scenario crisis-mars-v1 does not exist" | Seed was not run | `npm run db:seed` |
| `session:create` fails with "relation role does not exist" | Migrations were not applied | `supabase db push` |
| `facilitator_session_summary` returns empty | Wrong token pasted in URL, or session was created against a different DB | Re-run `session:create` against the correct Supabase project. |
| GitHub Actions deploy step fails with "401 Unauthorized" | Bad Cloudflare API Token | Re-create the token in Cloudflare dashboard and update the GitHub secret. |
| Anonymous sign-ins fail with 400 | "Allow anonymous sign-ins" not enabled | Supabase dashboard → Authentication → Configuration → enable. |

---

## Environment variable cheatsheet

| Variable | Used by | Required in |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Web app, seed script, session:create | `.env`, GitHub Actions secrets, Cloudflare Pages env vars |
| `PUBLIC_SUPABASE_ANON_KEY` | Web app | `.env`, GitHub Actions secrets, Cloudflare Pages env vars |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed script, session:create | `.env` only (never GitHub Actions, never Cloudflare) |
