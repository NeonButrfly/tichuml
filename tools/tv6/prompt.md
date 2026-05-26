# Codex prompt — start clean and implement alt table

You are implementing the Tichu alt table from the short-path asset pack `tichu_v6.zip`.

Do not use old table code as a source of truth. Start clean for the alt table route/component. The existing implementation has repeatedly failed because it rebuilt a table procedurally and misread passing-lane rotation. This task is to build a dynamic UI on top of the approved static table plate and the locked passing anchors.

## Asset install

Extract `tichu_v6.zip` into the repo as exactly:

```txt
assets/tichu_v6/
```

The folder must contain files directly like:

```txt
assets/tichu_v6/t/plate.png
assets/tichu_v6/p/a.json
assets/tichu_v6/p/o.png
assets/tichu_v6/c/map.json
```

No nested `tichu_v6/tichu_v6/` wrapper. No long paths. No v3/v4/v5 assets.

Copy `lock.json` and `check.mjs` from the guard files into the repo root. Before UI work, run:

```bash
node check.mjs assets/tichu_v6 --lock lock.json
```

If it fails, stop and fix the asset copy. Do not code around missing or wrong assets.

## Absolute rendering rules

The alt table is a layered 2D scene in a fixed design space:

```ts
const DESIGN_W = 1536;
const DESIGN_H = 1024;
```

The base table is exactly this image:

```txt
assets/tichu_v6/t/plate.png
```

Do not rebuild the table from CSS divs, canvas, WebGL, SVG, DOM rails, 3D transforms, lights, filters, shadows, vignettes, generated geometry, or screenshots. Render the base table as one image. Dynamic objects go on top.

Use one shared contain-fit transform for every layer:

```ts
export function getTableTransform(viewW: number, viewH: number) {
  const scale = Math.min(viewW / 1536, viewH / 1024);
  return {
    scale,
    x: (viewW - 1536 * scale) / 2,
    y: (viewH - 1024 * scale) / 2,
  };
}

export function designRectToCss(r: {x:number;y:number;w:number;h:number}, viewW:number, viewH:number) {
  const t = getTableTransform(viewW, viewH);
  return {
    left: t.x + r.x * t.scale,
    top: t.y + r.y * t.scale,
    width: r.w * t.scale,
    height: r.h * t.scale,
  };
}
```

Base table, cards, lanes, hit targets, debug overlay, and drag/drop math must all use this same transform. No independent X/Y scale.

## Passing lanes: source of truth

Use only:

```txt
assets/tichu_v6/p/a.json
```

Do not infer lane orientation. Do not reinterpret based on camera or player perspective. Read these fields and use them exactly:

```txt
id
arrow_direction
slot_orientation
slot_rotation_deg
user_rotation_deg
bbox_px
polygon_px
```

There are exactly 12 anchors. If not, fail immediately.

Locked map:

```txt
north_pass_left     left    landscape  rot 0
north_pass_across   south   portrait   rot 0
north_pass_right    right   landscape  rot 0

south_pass_left     left    landscape  rot 0
south_pass_across   north   portrait   rot 0
south_pass_right    right   landscape  rot 0

west_pass_north     north   portrait   rot -90
west_pass_across    east    landscape  rot +90
west_pass_south     south   portrait   rot +90

east_pass_north     north   portrait   rot -90
east_pass_across    west    landscape  rot +90
east_pass_south     south   portrait   rot +90
```

Critical side-seat rule:

```txt
East/west across lanes are horizontal.
East/west north and south lanes are vertical.
```

The production passing overlay is:

```txt
assets/tichu_v6/p/o.png
```

Show it only during passing phase. The slots-only overlay is `p/s.png`. The arrows-only overlay is `p/r.png`. The debug overlay is `p/d.png` and must be dev-only.

Also render real DOM drop targets from `p/a.json` with `data-pass-anchor-id`. The overlay alone is not enough. A dynamic hit target must exist for each lane.

## Cards

Use real image assets from:

```txt
assets/tichu_v6/c/map.json
```

Render standard cards from `c/std`, special cards from `c/sp`, and backs from `c/back`. Preserve natural aspect ratio. No text-only cards. No placeholders. No crop.

## Required demo flow

Build a deterministic alt-table demo route/component, e.g. `/alt-table` or the repo’s equivalent.

It must support this visible flow:

1. Initial state: table plate visible, deck ready, no fake/procedural table.
2. Deal 8: deal exactly 8 cards to each seat from a 56-card Tichu deck.
3. Grand Tichu window: after deal 8 and before deal 6, show a visible `Call GT` control for the current/south player. It can record a boolean call; scoring does not need to be finished.
4. Next deal 6: deal exactly 6 more cards to each seat, producing 14-card hands.
5. Passing phase: show 12 passing lanes from `p/a.json` and the production overlay `p/o.png`.
6. Passing interaction: player selects exactly 3 cards and assigns one to each required lane. At minimum for South, support `south_pass_left`, `south_pass_across`, and `south_pass_right`; if the demo supports all seats, each seat has 3 assignments.
7. Complete pass: assigned cards move to their exact anchor/hit target positions, then a confirm action transitions to post-pass/table-ready state.

The UI may use buttons for `Deal 8`, `Call GT`, `Deal 6`, and `Confirm Pass` if drag-and-drop is not already in the repo. Drag/drop is better, but correct state and dynamic slot assignment are mandatory.

## Fail-fast validation

Add a startup/test validation that imports/loads `assets/tichu_v6/p/a.json` and fails immediately if:

- any anchor ID is missing
- there are not exactly 12 anchors
- any `arrow_direction` differs from the locked map
- any `slot_orientation` differs from the locked map
- any `slot_rotation_deg` differs from the locked map
- `t/plate.png` is not the base table image
- `p/o.png` is not the production passing overlay
- card assets from `c/map.json` are missing

Run the included guard before tests:

```bash
node check.mjs assets/tichu_v6 --lock lock.json
```

## Runtime snapshot required

Create a test helper or dev-only function that emits `alt_table_snapshot.json` with this shape:

```json
{
  "design": { "w": 1536, "h": 1024 },
  "table": {
    "src": "assets/tichu_v6/t/plate.png",
    "naturalW": 1536,
    "naturalH": 1024,
    "uses3d": false,
    "usesCanvas": false,
    "usesCssTable": false
  },
  "passOverlay": { "src": "assets/tichu_v6/p/o.png" },
  "passAnchors": [
    { "id": "east_pass_across", "arrow_direction": "west", "slot_orientation": "landscape", "slot_rotation_deg": 90 }
  ],
  "cards": { "usesImages": true, "usesPlaceholders": false },
  "flow": { "firstDeal": 8, "secondDeal": 6, "passCount": 3 }
}
```

Then run:

```bash
node check.mjs assets/tichu_v6 --lock lock.json --snap alt_table_snapshot.json
```

This must pass before the task is complete.

## Tests to add

Add or update automated tests in the repo’s native test stack. If there is Playwright/Cypress, use it for UI. If not, add unit tests for state and layout helpers.

Minimum tests:

1. Asset lock test runs `node check.mjs assets/tichu_v6 --lock lock.json`.
2. Base table test asserts the rendered table image src ends with `t/plate.png`, natural size is 1536x1024, and computed style has no filter and no 3D transform.
3. Passing anchor test asserts exactly the 12 locked directions/orientations/rotations.
4. Passing DOM test asserts 12 `[data-pass-anchor-id]` targets exist during passing phase and their ids match `p/a.json`.
5. Side-lane regression test asserts:
   - `east_pass_north` is portrait and rot -90
   - `east_pass_across` is landscape and rot +90
   - `east_pass_south` is portrait and rot +90
   - `west_pass_north` is portrait and rot -90
   - `west_pass_across` is landscape and rot +90
   - `west_pass_south` is portrait and rot +90
6. Deal flow test asserts:
   - after `Deal 8`, each player has 8 cards
   - `Call GT` is available before second deal
   - after `Deal 6`, each player has 14 cards
   - passing phase starts after final deal
   - selecting/assigning 3 cards enables confirm pass
7. Card asset test asserts all rendered card faces/backs use paths from `c/map.json`, not placeholders.
8. Responsive transform test asserts base table, overlay, and pass target positions use identical scale/offset.

## Visual comparison

If the repo has screenshot tests, add two screenshots at a 1536x1024 viewport:

1. Base table only / pre-deal.
2. Passing phase with `p/o.png` overlay and 12 live hit targets.

Compare against the asset dimensions and DOM positions, not an old generated screenshot. The screenshot test should fail if:

- table image is not `t/plate.png`
- overlay is not `p/o.png`
- side seats render across lanes vertical instead of horizontal
- north/south across lanes render horizontal instead of vertical
- any passing target is missing

## Acceptance criteria

You are done only if all are true:

- The alt table renders from `assets/tichu_v6/t/plate.png`.
- No procedural/3D/CSS-built table is visible or used.
- `Deal 8` works and creates 8 cards per player.
- `Call GT` is available after first deal and before second deal.
- `Deal 6` works and creates 14 cards per player.
- Passing phase appears after second deal.
- The 12 passing lanes are live dynamic hit targets, not just a picture.
- East/west north+south lanes are vertical.
- East/west across lanes are horizontal.
- Directions/rotations match `p/a.json` exactly.
- Cards render with actual image assets from `c/map.json`.
- Runtime snapshot passes `check.mjs`.
- Existing lint/typecheck/tests/build pass.

At the end, report:

- exact asset root used
- exact table component changed/created
- exact passing overlay used
- exact anchor JSON used
- commands run and results
- whether any procedural/3D/CSS table path remains
