# Alternate 2.5D Gameplay Table

This alternate table adds a second live gameplay renderer for Tichu without
replacing the existing normal table. The normal table remains the behavioral
source of truth; the alternate table is a South-perspective luxury play surface
that reuses the same backend-backed game state, legal-action logic, selection
rules, and action dispatch pipeline.

## Renderer Choice

The implementation now uses a hybrid renderer:

- React still owns the gameplay interaction shell.
- React Three Fiber now draws the alternate 3D table body with a real camera
  and bounded rotation controls.
- DOM overlays still own live cards, seat plaques, pass lanes, and actionable
  controls so the existing gameplay handlers remain intact.

This keeps the real gameplay pipeline intact while moving the visual weight off
the earlier CSS-only panel stack and Pixi faux-depth pass.

The latest layout pass also stops inventing separate seat geometry for the
alternate renderer. Seat racks, south-hand span, and pass-route placement now
derive from the normal table's live hand bounds and canonical pass-lane
anchors before being projected onto the perspective luxury surface.

The current 3D cohesion pass adds a shared scene-anchor layer in
`apps/web/src/alternate-table/scene-layout.ts` so the south shelf, north tray,
side trays, trick bowl, and pass cups all derive from those same projected
table anchors instead of using alternate-only freehand placement.

The latest rotation/layout pass removes the unused center ornament props,
replaces the old preset-only camera feel with bounded drag-or-button yaw
rotation, widens the table footprint, and reworks the south hand fan so the
cards sit on a cleaner shared plane closer to the reference perspective.

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
selection behavior. The alternate view now intentionally trims the visible
utility chrome down to the core action row plus `Clear` / `Continue AI` so
more of the frame is devoted to the table surface.

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

The latest rail-integration pass also keeps the alternate pass slots visibly
framed even when empty and moves the displayed route geometry beside the
source rails instead of letting those lanes collapse back toward the center.

## Known Limitations

- The alternate table intentionally keeps event/state summaries minimal so the
  felt, trick area, and south rail remain the dominant visual surface.
- The luxury surface is still asset-free and procedural, so wood/felt detail is
  stylized rather than photoreal.
- The current acceptance blocker is no longer scattered seat math; it is final
  3D material polish, the remaining black headspace above the table, and deeper
  camera-to-overlay cohesion for the cards themselves.
- Issue [#81](https://github.com/NeonButrfly/tichuml/issues/81) remains the
  acceptance tracker for spacing and composition polish on live gameplay
  screens.
