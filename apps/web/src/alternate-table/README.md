# Alternate 2.5D Gameplay Table

This alternate table adds a second live gameplay renderer for Tichu without
replacing the existing normal table. The normal table remains the behavioral
source of truth; the alternate table is a South-perspective luxury play surface
that reuses the same backend-backed game state, legal-action logic, selection
rules, and action dispatch pipeline.

## Renderer Choice

The implementation uses the existing React + CSS stack instead of introducing a
separate graphics runtime. That keeps risk low, preserves the current gameplay
pipeline, and still allows a polished 2.5D table through layered gradients,
perspective transforms, plaques, rails, card racks, and animated selection
states.

## Shared Gameplay Path

- Controller and action plumbing still live in
  `apps/web/src/App.tsx`.
- Table/view toggle parsing lives in
  `apps/web/src/game-table-view-model.ts`.
- The alternate renderer lives in
  `apps/web/src/alternate-game-table-view.tsx`.
- The normal renderer remains in
  `apps/web/src/game-table-views.tsx`.

Both table variants consume the same `GameTableViewProps` data and invoke the
same callbacks for play, pass, Tichu, Grand Tichu, wish, exchange, sort, and
selection behavior.

## Navigation

- Default table: load the normal app route as before.
- Alternate table: add `?table=alt` to the gameplay URL.
- In-app toggle: use the main menu to switch between `Classic Table` and
  `Luxury Table`.
- Return to normal: remove `?table=alt` or switch back from the same menu.
- Linux host preview: `bash scripts/start-frontend.sh --host 0.0.0.0 --port 5174 --backend-url http://<host>:4310`
  then open `http://<host>:5174/?table=alt`.

The existing normal route and debug route are unchanged.

## Hidden Information

Opponent hands stay hidden in the alternate table. North, East, and West render
card backs plus counts only; the alternate renderer does not read or expose any
extra hidden cards beyond what the normal gameplay view already receives.

## Mockups And Preview

Visual direction was guided by the reference mockups in `mockups/`, but the
shipped alternate table is still backed by the real live game state and action
pipeline. No mock state replaces the main gameplay path.

If a future visual-only preview is needed, keep it behind an explicit dev-only
entry point rather than changing the main table flow.

## Known Limitations

- The alternate table intentionally keeps event/state summaries compact so the
  felt, trick area, and south rail remain the dominant visual surface.
- The luxury surface is intentionally asset-free and procedural, so decorative
  detail comes from CSS rather than external textures or images.
