# Alternate 2.5D Gameplay Table

This alternate table adds a second live gameplay renderer for Tichu without
replacing the existing normal table. The normal table remains the behavioral
source of truth; the alternate table is a South-perspective luxury play surface
that reuses the same backend-backed game state, legal-action logic, selection
rules, and action dispatch pipeline.

## Renderer Choice

The implementation now uses a projection-driven hybrid renderer:

- React still owns the gameplay interaction shell and all live actions.
- `apps/web/src/alternate-table/south-perspective-projection.ts` is the pure
  fake-perspective module. It projects logical table-space coordinates into
  screen positions, scale, rotation, and shadow values.
- `apps/web/src/alternate-table/three-surface.tsx` now acts as the immersive
  oval tabletop surface rather than a separate decorative scene.
- DOM overlays still own the real cards, pass routes, and buttons so the
  existing gameplay handlers remain intact.

This keeps the real gameplay pipeline intact while making the alternate table
behave like a single low south-camera board instead of a collection of overlay
panels.

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
  felt, trick area, and south rail remain the dominant visual surface.
- The luxury surface is still asset-free and procedural, so the wood grain is
  stylized rather than photoreal.
- The current acceptance blocker is no longer geometry drift. The remaining
  work is mostly finish work: finer wood treatment, better background taste,
  and more phase-by-phase polish for passing and trick resolution.
- Issue [#81](https://github.com/NeonButrfly/tichuml/issues/81) remains the
  acceptance tracker for spacing and composition polish on live gameplay
  screens.
