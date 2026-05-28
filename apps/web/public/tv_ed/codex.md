# Codex prompt for tichu_v15

Use only `apps/web/public/tv15`. Runtime root is `/tv15`.

Run first:

```bash
node apps/web/public/tv15/x/check.mjs apps/web/public/tv15
```

If it fails, stop and fix extraction.

## Important delta from tv14

The cards were approved. Keep the hand/card math from `h/a.json` / `h/math.json`.

East/west passing lanes were wrong. Use the new angled polygon targets in `p/a.json`.

Do not use old tv6-tv14 files after installing tv15.

## Architecture

The alt table is a 2D layered scene. Do not build a procedural, CSS, canvas, WebGL, Phaser, Pixi, Three.js, or 3D table.

Layer order:

1. `/tv15/t/base.png`
2. `/tv15/t/dragon.png`
3. dynamic hands/tricks from anchors
4. `/tv15/p/o.png` during passing phase
5. assigned pass cards and UI

All dynamic components are positioned with math from JSON anchors. Do not image-generate cards, pass targets, hands, or trick positions.

## Fixed design space

```ts
const DESIGN_W = 1536;
const DESIGN_H = 1024;
function fit(viewW: number, viewH: number) {
  const scale = Math.min(viewW / DESIGN_W, viewH / DESIGN_H);
  return { scale, offsetX: (viewW - DESIGN_W * scale) / 2, offsetY: (viewH - DESIGN_H * scale) / 2 };
}
```

Use the same transform for table layers, hand cards, pass hit targets, trick cards, drag/drop, and snapshots. No non-uniform scaling.

## Cards / hands

Load `/tv15/h/rack.json`, `/tv15/h/a.json`, and `/tv15/h/math.json`.

- card math is locked from the approved preview.
- north/east/west cards render inside rack channels.
- east/west cards are angled along the side rails.
- north cards should visually have the bottom third tucked/hidden by the rail and top two-thirds visible.
- south cards render as a rail-seated fan.
- no generic flex rows.
- every displayed card uses real image assets from `/tv15/c/`.

Render a card from an anchor using its `center_px`, `w_px`, `h_px`, and `rotation_deg`.

## Passing

Load `/tv15/p/a.json`. Render `/tv15/p/o.png` only during passing. Create 12 dynamic hit targets from `p/a.json`.

Passing map is still locked:

```txt
north_pass_left     -> left    landscape rot 0
north_pass_across   -> south   portrait  rot 0
north_pass_right    -> right   landscape rot 0
south_pass_left     -> left    landscape rot 0
south_pass_across   -> north   portrait  rot 0
south_pass_right    -> right   landscape rot 0
east_pass_north     -> north   portrait  rot -90
east_pass_across    -> west    landscape rot 90
east_pass_south     -> south   portrait  rot 90
west_pass_north     -> north   portrait  rot -90
west_pass_across    -> east    landscape rot 90
west_pass_south     -> south   portrait  rot 90
```

New tv15 geometry rule:

- north/south passing targets are axis-aligned polygons.
- east/west passing targets are angled polygons following the side rail.
- `polygon_px` is the source of truth for target visual shape and hit testing.
- `bbox_px` is only an envelope for angled side targets.
- `visual_rotation_deg` / `shape_rotation_deg` gives the pass target shape angle.
- `card_rotation_deg` is the original logical pass-card orientation metadata.

Do not flatten east/west passing lanes back to axis-aligned boxes.

## Trick area

Load `/tv15/k/a.json`. It is virtual only. Do not render a production trick overlay. Trick cards render dynamically over the dragon layer.

## Demo flow

Maintain:

`ready -> deal8 -> grand_tichu -> deal6 -> passing -> passed`

Deal 8 to each player using `h/a.json`, show GT call/skip, then deal 6 more, then show passing overlay/hit targets. South selects exactly 3 and assigns them to south pass lanes. Auto demo pass may fill all 12 lanes for visual verification.

## Required tests

- `node apps/web/public/tv15/x/check.mjs apps/web/public/tv15` passes.
- 56 hand anchors, 14 per seat.
- 12 passing anchors with exact logical map.
- side passing targets have non-zero `shape_rotation_deg` and polygon hit areas.
- east/west pass anchors use matching keyed edges and spacing rhythm.
- 5 virtual trick anchors.
- north/east/west hand cards render inside rack channels.
- no generic card rows.
- all card `src` values come from `/tv15/c/`.
- runtime snapshot reports `/tv15/t/base.png`, `/tv15/t/dragon.png`, `/tv15/h/a.json`, `/tv15/p/a.json`, `/tv15/k/a.json`.
- browser proof compares DOM polygons/boxes against JSON anchors at 1536x1024 and one responsive viewport.

Run before done:

```bash
npm run lint
npm run test
npm run build
npm run verify:browser:alt
```
