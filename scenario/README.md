# Scenario data

This directory holds the canonical, version-pinned definition of the *Crisis: Mars*
scenario. It is the **source of truth** for game content. The Supabase seed script
(`scripts/seed-from-scenario.mjs`) reads from this directory and loads it into the
`scenario`, `faction`, `role`, `role_availability`, `map`, `map_score_track`,
`map_location`, and `card_template` tables.

## Files

| File | Contents |
|---|---|
| `crisis-mars-v1.json` | The scenario data: factions, roles, NPCs, maps, score tracks, card templates, starting resource distribution, war correspondence, schedule. |
| `schema.json` | JSON Schema (draft-07) that `crisis-mars-v1.json` must conform to. |
| `README.md` | This file. |

## Source

Game text and resource distribution are pulled verbatim (with minor copy-edits noted
inline) from:

- `game_files/Crisis Mars v1.0 Data.xlsx` - factions, roles, resource card
  inventories, NPC resource inventories, resource flavour text.
- `crisis_mars_web_runner_spec.md` sections 4, 13, 14.1 - schedule, map score tracks,
  map locations, war correspondence.

If the spreadsheet and the spec disagree on game content (e.g. role names, card
counts), the spreadsheet wins because it is the live ruleset. Differences from the
spec discovered so far:

- Spec section 10.3 says "each player starts with 5 resource cards"; spreadsheet
  confirms 5 per role.
- NPCs (N1 UN Ambassador, N2 Martian Senate Speaker) hold 9 resource cards each in
  the spreadsheet; the spec just says they should have a "full resource inventory".
- Role names use the spreadsheet's exact wording (e.g. `V&P Boss`, not the spec's
  `Vesta & Pallas Boss`).

## Validation

```bash
npm run scenario:validate
```

This runs AJV against `schema.json` and exits non-zero on any violation. Run it
before every commit that touches scenario data, and it is invoked by CI.

## Editing rules

1. **Never change `id` once it has been seeded into a real database.** New scenarios
   get new IDs.
2. **`code` (role) and `id` (resource template) are immutable contracts** with the
   physical printed cards and badges.
3. **Adding a new resource template** requires (a) adding it under `card_templates`
   and (b) optionally distributing it under `starting_resource_distribution`.
4. **Schedule changes** affect timer behaviour at runtime but do not affect existing
   sessions.
5. **Run `npm run scenario:validate` after every edit.**
