# ADR 0003 - Token separation

**Status:** Accepted, 2026-06-17
**Spec sections:** 6.2, 7, 11.1, 22, 28.1

## Decision

The system uses **six distinct token types**, each scoped to a single purpose
and a single column. Tokens are stored as **hashes**, never as raw values.
Tokens never overlap; a role badge token cannot identify a card and a card
token cannot grant role access.

## The six token types

| Token | Purpose | Storage | Visible to | Rotation |
|---|---|---|---|---|
| **Game join** | Players reach the session | `game_session.join_code_hash` | Facilitator + players who already have the link | Per session |
| **Facilitator** | Grants facilitator dashboard | `game_session.facilitator_code_hash` | Facilitators only | Per session |
| **Role badge** | Claim/rejoin a specific role | `role_access_token.token_hash` | Embedded in printed badge; one per role | Facilitator can rotate or lock |
| **Manual role code** | Fallback when QR fails | `role_access_token.manual_code_hash` | Printed under the QR on the badge | Rotated together with the role badge |
| **Resource card** | Identifies a physical card | `card_instance.qr_token_hash` | Embedded in the physical card (or sticker) | Static for the life of the session |
| **Trade** | One-shot trade proposal | `trade_event.trade_token_hash` | Generated and consumed within seconds | Expires automatically |

## Why this matters

Spec sections 11.1 and 28.1 are explicit that role tokens and card tokens are
different things. If we conflated them:

- A leaked role badge would also identify cards (or vice versa).
- Recall and reclaim could be triggered with a card scan instead of through the
  hand UI, breaking the audit trail.
- The facilitator's ability to lock a lost badge would also disable any cards
  that shared the same token, which makes no sense.

Per spec section 22, players cannot recall cards they do not own, cannot reclaim
cards they did not originally hold, and cannot read other private briefs. The
token separation is what makes those rules enforceable at the database layer:
each RLS policy compares the JWT's `participant_id` claim against a specific
column, not a generic "token".

## Storage rules

1. **Always store the hash, never the raw token.** Use a salted hash (the
   default in `pgcrypto`'s `digest('sha256')` is sufficient for this scale; the
   tokens are random and one-shot).
2. **Never select the hash to a client.** RLS denies `select` on
   `role_access_token` to non-facilitators. Facilitators see status only, not
   the underlying hash.
3. **The raw token only lives in:**
   - The printed badge (for role tokens).
   - The printed card (for resource tokens).
   - The URL fragment of a freshly minted link (game join / facilitator).
   - The QR data of a freshly generated trade prompt.
4. **The raw token is verified by a `SECURITY DEFINER` RPC** which hashes the
   input, looks up the row, and exchanges it for a scoped action (claim role,
   restore role, propose trade, confirm trade).

## Lifecycle

- **Game join:** issued at session creation, valid until session ends.
- **Facilitator:** issued at session creation, valid until session ends, can be
  rotated by a facilitator.
- **Role badge:** issued at session creation (one per role), can be rotated by
  a facilitator, can be locked (status -> `locked`) if the badge is lost.
- **Manual role code:** generated alongside role badge, rotated together.
- **Resource card:** generated for each card instance when the session is
  created or when a card is added; never rotated (the physical card is the
  source).
- **Trade:** generated per trade proposal, expires within seconds (spec section
  11.6), single-use.

## Consequences

- **Pro:** Lost-badge handling is a small, auditable operation: rotate the role
  badge token and reissue. Nothing else changes.
- **Pro:** Resource card QR codes can be photographed and shared without giving
  away role access.
- **Pro:** RLS policies stay tight because they refer to specific JWT claims
  ("are you this participant?") rather than "do you hold any of these tokens?".
- **Con:** Six token columns to manage. Mitigated by keeping each behind a
  single RPC and never exposing raw values to clients.

## Revisit when

- We need NFC alongside QR (spec section 2.2 calls this optional). NFC adds
  another transport but not another token type; the same scheme should apply.
- We need observer or press tokens. Add a new token type rather than reusing an
  existing one.
