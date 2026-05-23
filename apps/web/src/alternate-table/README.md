# Alternate 2.5D Gameplay Table

This alternate table adds a second live gameplay renderer for Tichu without
replacing the existing normal table. The normal table remains the behavioral
source of truth; the alternate table is a South-perspective luxury play surface
that reuses the same backend-backed game state, legal-action logic, selection
rules, and action dispatch pipeline.

## Renderer Choice

The implementation now uses a projection-driven Phaser scene:

- React still owns the gameplay interaction shell, routing, and all live
  actions.
- `apps/web/src/alternate-table/south-perspective-projection.ts` is the pure
  fake-perspective module. It projects logical table-space coordinates into
  screen positions, scale, rotation, and shadow values.
- `apps/web/src/alternate-table/phaser-surface.tsx` mounts the alternate
  Phaser scene and redraws the table, seats, remote hands, pass routes, trick
  cards, and south hand on one shared scene plane.
- The same host also keeps a procedural canvas fallback underneath the Phaser
  canvas so the alternate table still presents as one coherent scene if Phaser
  fails to initialize in a given browser environment.
- `apps/web/src/alternate-game-table-view.tsx` now supplies a minimal DOM layer
  for reliable hit targets, action buttons, and phase-specific dialogs while
  the visible tabletop itself is rendered in Phaser.

This keeps the real gameplay pipeline intact while making the alternate table
behave like one staged south-camera scene rather than a stack of projected DOM
panels.

The current visual target is the attached low-camera wooden-table reference:
a broad oval tabletop filling most of the viewport, a near upright south hand,
smaller far hands on the back arc, trick cards resting on the tabletop with
soft shadows, and only a small amount of supporting chrome above the play
surface.

The latest stabilization pass replaced the old loose stage sizing with a
deterministic viewport-normalized rig:

- the scene always measures the real immersive stage viewport instead of
  inflating to large minimum fallback dimensions
- the table ellipse is anchored around `50% / 56%` with a `47% x 34%` radius
- the near rim stays visible near the bottom edge while the far edge stays high
  enough to preserve the seated south-player camera
- HUD panels are now overlay layers and do not reserve document flow space

## Shared Gameplay Path

- Controller and action plumbing still live in
  `apps/web/src/App.tsx`.
- Table/view toggle parsing lives in
  `apps/web/src/game-table-view-model.ts`.
- The alternate renderer lives in
  `apps/web/src/alternate-game-table-view.tsx`.
- The Phaser scene host lives in
  `apps/web/src/alternate-table/phaser-surface.tsx`.
- The normal renderer remains in
  `apps/web/src/game-table-views.tsx`.

Both table variants consume the same `GameTableViewProps` data and invoke the
same callbacks for play, pass, Tichu, Grand Tichu, wish, exchange, and
selection behavior. The immersive table intentionally trims visible utility
chrome down to the core action row plus `Clear` / `Continue AI` so more of the
frame is devoted to the table surface and projected cards.

## Navigation

- Default table: load the normal app route as before.
- Alternate table: add `?table=alt` to the gameplay URL.
- Dev pass preview: in local development only, add `?table=alt&preview=pass-select`
  to boot a real engine-driven `pass_select` state with South still owning the
  unresolved exchange. This exists only to tune the luxury renderer against the
  canonical live passing geometry.
- Layout debug: add `&layoutDebug=1` to show viewport bounds, the projected
  table ellipse, seat anchors, and HUD safe zones. This overlay is off by
  default and is only for layout tuning.
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

Pass-route direction and placement are derived from the same canonical normal
table lane schema, so the alternate table does not fork exchange logic or
invent a second directional mapping.

## Mockups And Preview

Visual direction was guided by the reference mockups in `mockups/`, but the
shipped alternate table is still backed by the real live game state and action
pipeline. No mock state replaces the main gameplay path.

The current dev-only preview uses the real engine transition path rather than a
fake mock state: it declines the opening Grand Tichu window, submits
non-South pass selections through the engine, and leaves the local South seat
as the live `select_pass` actor.

Focused layout regression checks now live in
`tests/integration/alternate-table-layout.test.ts` and
`tests/integration/alternate-hand-layout.test.ts`. Scene-anchor regression
coverage now also lives in
`tests/integration/alternate-table-scene-layout.test.ts` so the anchor-driven
felt coverage, pass-lane clearance, south-hand compression, and 3D tray/shelf
ordering do not silently drift backward.

The latest immersive projection pass adds
`tests/integration/south-perspective-projection.test.ts` so the core camera
behavior stays stable: near cards stay larger and lower, distant cards stay
smaller and higher, and horizontal spread compresses with depth.

## Known Limitations

- The alternate table intentionally keeps event/state summaries minimal so the
  tabletop remains the dominant visual surface.
- The Phaser scene is still procedural and asset-free, so the room and wood
  finish are stylized rather than photoreal.
- The current acceptance blocker is finish quality, not gameplay plumbing:
  material richness, per-phase trick/pass polish, and continued camera tuning
  still need iteration against issue `#81`.
- Issue [#81](https://github.com/NeonButrfly/tichuml/issues/81) remains the
  acceptance tracker for live composition and polish on the immersive table.
