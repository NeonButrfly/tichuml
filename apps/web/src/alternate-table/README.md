# Alternate 2.5D Gameplay Table

This alternate table adds a second live gameplay renderer for Tichu without
replacing the existing normal table. The normal table remains the behavioral
source of truth; the alternate table is a South-perspective luxury play surface
that reuses the same backend-backed game state, legal-action logic, selection
rules, and action dispatch pipeline.

The visual contract for the current 3D rebuild is
`docs/reference/photorealistic-alt-tichu-table.png`. That reference should be
treated as the target composition for the alternate table only.

## Renderer Choice

The implementation now uses a projection-driven React Three Fiber scene with
procedurally generated local materials:

- React still owns the gameplay interaction shell, routing, and all live
  actions.
- `apps/web/src/alternate-table/south-perspective-projection.ts` remains the
  pure geometry source. It still derives canonical seat, hand, and pass-lane
  anchors from the existing normal table layout so the alternate view does not
  fork interaction ownership.
- `apps/web/src/alternate-table/scene-model.ts` is the shared scene contract
  between the table shell and the 3D surface.
- `apps/web/src/alternate-table/three-surface.tsx` is the current immersive
  visual surface. It renders the room, walnut table, green felt inset, wooden
  trays, 3D card meshes, plaques, tabletop pass slots, and card shadows inside
  one React-hosted scene.
- `apps/web/src/alternate-table/assets/generated/README.md` documents the
  generated/local asset approach for wood, felt, plaques, card backs, and
  special-card art.
- `apps/web/src/alternate-table/phaser-surface.tsx` remains in the repo as the
  earlier alternate-scene experiment, but the current live alternate table is
  driven by the React Three Fiber surface instead.
- `apps/web/src/alternate-game-table-view.tsx` still supplies a small DOM layer
  for reliable hit targets, action buttons, and phase dialogs while the visible
  table body is rendered in the 3D scene.

This keeps the real gameplay pipeline intact while moving the alternate table
closer to the wooden-table reference image: one shared south-camera scene
instead of layered projected UI.

The current visual target is the attached premium wooden-table reference:
a dark walnut frame, green felt inset, raised trays on all four sides, a near
upright south hand, smaller far hands in their own trays, and trick/pass cards
resting physically on the felt under warm cinematic lighting.

The latest stabilization pass replaced the old loose stage sizing with a
deterministic viewport-normalized rig:

- the scene always measures the real immersive stage viewport instead of
  inflating to large minimum fallback dimensions
- the table ellipse is anchored around `50% / 56%` with a `47% x 34%` radius
- the near rim stays visible near the bottom edge while the far edge stays high
  enough to preserve the seated south-player camera
- HUD panels are now overlay layers and do not reserve document flow space
- the 3D surface now owns the visible table body and cards, while DOM remains
  only for hit testing and controls

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
- The React Three Fiber scene is still fully procedural, so the materials are
  locally generated rather than scanned or photo-based.
- The current 3D hand trays still need more tuning against the reference
  image, especially felt/wood fidelity, south-hand proportion, and exchange-slot
  readability.
- The current acceptance blocker is finish quality, not gameplay plumbing:
  material richness, per-phase trick/pass polish, and continued camera tuning
  still need iteration against issue `#81`.
- Issue [#81](https://github.com/NeonButrfly/tichuml/issues/81) remains the
  acceptance tracker for live composition and polish on the immersive table.
