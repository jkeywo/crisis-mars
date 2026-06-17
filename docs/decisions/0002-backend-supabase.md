# ADR 0002 - Backend: Supabase

**Status:** Accepted, 2026-06-17
**Spec sections:** 3.2, 3.3, 21, 22, 24

## Decision

Use Supabase (Postgres + Realtime + Auth + Storage) as the entire backend, with
the schema and Row-Level Security mirroring spec sections 24 and 22. State-
changing operations go through `SECURITY DEFINER` Postgres functions, not
direct table writes.

## Context

The spec recommends Supabase, with Firebase as an alternative. Crisis: Mars
state is strongly relational (factions -> roles -> cards -> holders; sessions ->
participants -> hands; maps -> score tracks -> score values; actions -> resolutions ->
audit) and the per-player view of the world depends on per-row authorisation
("a card is visible to its holder and original owner only").

## Forces

- **Strongly relational** state with frequent joins (player -> hand -> trades -> audit).
- **Per-row authorisation** (private brief, hand contents, audit).
- **Realtime updates** for timer, scores, calls, card transfers.
- **Free tier** must cover one game (12-18 players, ~3 hour session, ~10s update
  cadence on hot tables).
- **Anonymous join** by QR; no email/password.

## Options considered

1. **Supabase** *(chosen)*
   - Postgres maps to the spec's data model literally.
   - RLS expresses "current holder OR original owner OR facilitator" in a few
     lines per table.
   - Realtime subscriptions over WebSocket cover all the channels listed in
     spec section 21.
   - Auth supports anonymous sessions with custom JWT claims, which is exactly
     the role-claim model spec section 22 needs.
   - Storage covers map images and card art on the same project.
   - Free tier is generous enough for the expected per-game load.

2. **Firebase**
   - Firestore is document-shaped; the card/hand/loan/recall model gets ugly
     because the same card row needs to be authorised against three identities
     (current holder, original owner, facilitator). Implementable but verbose.
   - Realtime, Auth, Hosting, FCM are all polished, but RLS-equivalent rules
     are JavaScript-shaped and harder to keep in sync with a relational model.

3. **PocketBase / self-host**
   - Cheaper at scale but breaks the "free hosting" constraint and adds ops.

## Implementation pattern

- **Schema:** `supabase/migrations/0001_init.sql` mirrors spec section 24 one-
  to-one. Enums for status fields keep vocabulary aligned.
- **RLS:** `supabase/migrations/0002_rls.sql` enables RLS on every table and
  expresses the spec section 22 rules using helper functions that read JWT
  claims (`jwt_session_id`, `jwt_participant_id`, `jwt_permission_level`,
  `is_facilitator`).
- **Mutations:** All player-driven state changes go through `SECURITY DEFINER`
  functions (in `0003_functions.sql`, currently a placeholder). Each function:
  1. Verifies authorisation from JWT claims.
  2. Validates pre-conditions (card state, ownership, phase, reclaim quota).
  3. Performs the change inside a single transaction.
  4. Inserts an `audit_event` or `card_audit_event`.
- **Realtime:** Subscribe to a small set of channels per participant: their own
  hand updates, their session's timer, their faction's opportunities, the
  current map calls. Spec section 21 lists the full set; we add them lazily.
- **Service role:** Used only by `scripts/seed-from-scenario.mjs` and any
  serverless functions we add later. Never shipped to the client.

## Consequences

- **Pro:** RLS lets us push authorisation into the database, so a misbehaving
  client cannot read other players' private briefs or hands.
- **Pro:** Single vendor for DB, Realtime, Auth, Storage. One project to manage.
- **Pro:** SQL migrations are reviewable and replayable.
- **Con:** RLS performance on hot paths (e.g. realtime subscriptions on
  `card_instance`) needs measuring once we add realtime listeners. Indexes are
  in place but worth profiling under load.
- **Con:** Custom JWT claims require either Supabase Edge Functions or a small
  external service to mint, because the role-claim flow needs to take a
  short-lived role-badge token, validate it server-side, and exchange it for a
  scoped anonymous JWT. We will pay this cost in build-priority step 6.
- **Con:** Vendor lock-in. Migrating off Supabase later means rebuilding RLS in
  whatever the replacement is. Mitigated by keeping all SQL in `supabase/migrations`
  and not using Supabase-specific extensions beyond `pgcrypto`.

## Revisit when

- Per-session load exceeds the free tier in measurable ways.
- We need a feature Supabase doesn't expose (e.g. a different realtime model).
- A multi-region requirement appears.
