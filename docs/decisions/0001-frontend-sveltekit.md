# ADR 0001 - Frontend: SvelteKit with the static adapter

**Status:** Accepted, 2026-06-17
**Spec sections:** 3.1, 23

## Decision

Build the client as a SvelteKit 5 application with `@sveltejs/adapter-static`,
deployable as a pure static bundle to any free static host (Cloudflare Pages,
Netlify, GitHub Pages, Vercel static).

## Context

The spec recommends a static Progressive Web App and lists React/Vite, SvelteKit
static, and Vue as acceptable choices. The game has heavy reactive state (timers,
hand changes, alerts, action queues) and must work on phones in a venue with
unreliable Wi-Fi. Bundle size and runtime cost matter because the audience is
12-18 phones in the same room.

## Forces

- **PWA-first**, with a service worker and offline-readable rules and briefs
  (spec section 23).
- **Realtime UI** for timer, score, and card updates (spec section 21).
- **No accounts**, just anonymous JWTs (spec section 22).
- **Free hosting**, so a static output is mandatory.
- **Small team / solo build**, so DX matters.

## Options considered

1. **SvelteKit + adapter-static** *(chosen)*
   - Smallest runtime, smallest bundles, ergonomic stores fit phase/score
     reactivity.
   - Static adapter outputs an SPA fallback (`index.html`) that runs on any
     static host.
   - Native support for service workers via `src/service-worker.ts`.
   - Trade-off: less of a hire-able ecosystem than React, smaller plugin pool.

2. **React + Vite**
   - Biggest ecosystem, easiest to find collaborators.
   - Larger bundles by default and more boilerplate for stores/effects in a
     state-heavy app like this.
   - Would force a state library choice (Zustand/Jotai/Redux).

3. **Vue 3 + Vite**
   - Smaller than React, comparable DX.
   - Smaller ecosystem of PWA/realtime helpers than React; no clear advantage
     over SvelteKit for this app.

## Consequences

- **Pro:** small bundles, fast first paint on phones, simple reactivity for
  timer and card-state UIs.
- **Pro:** `adapter-static` keeps deployment to any of the named free hosts a
  drop-in.
- **Con:** Static adapter has no server runtime. All auth, RPCs, and data
  fetching go directly from the browser to Supabase. Anything that needs a
  server secret (e.g. minting facilitator JWTs from a private key) will need a
  small serverless function later, not a SvelteKit endpoint.
- **Con:** Svelte 5 runes are still new; some libraries have not caught up.
  Mitigated by keeping the runtime surface narrow and pulling in only well-
  maintained deps.

## Revisit when

- We need server-side rendering for SEO (currently no SEO requirement).
- We need server-side secrets at request time and can't justify a separate
  serverless function.
- A team member with React experience is the only available contributor for an
  extended period.
