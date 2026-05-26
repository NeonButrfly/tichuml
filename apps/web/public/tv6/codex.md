# Codex prompt — start clean with tichu_v6

Use this asset folder as the only source of truth. The ZIP is `tichu_v6.zip` and its root is flat: after extraction the first-level entries are `t/`, `p/`, `c/`, `x/`, `INDEX.md`, `config.json`, and this file. Do not expect another nested folder inside the ZIP.

Copy the extracted contents into the repo as `public/assets/tichu_v6/` or the repo's equivalent static asset root.

## Do not use old work

Do not use folders or files named v3, v4, v5, `direction_locked_update`, `tichu_table_v6_codex_complete`, or `tichu_table_v6_complete_codex_pack`.

Do not render a CSS/procedural/WebGL/3D table. Do not add dark lighting, rails, labels, fake perspective, vignette, or alternate table geometry. Use the table image exactly:

- `t/plate.png`

## 1536x1024 coordinate system

All assets are authored for `1536 x 1024`. Use one contain-fit transform for the base table, overlays, cards, hit targets, and drag/drop.

```ts
const DESIGN_W = 1536;
const DESIGN_H = 1024;
function getTableTransform(viewportW: number, viewportH: number) {
  const scale = Math.min(viewportW / DESIGN_W, viewportH / DESIGN_H);
  return {
    scale,
    offsetX: (viewportW - DESIGN_W * scale) / 2,
    offsetY: (viewportH - DESIGN_H * scale) / 2,
  };
}
```

No non-uniform scaling. No CSS perspective or rotate on the table layer.

## Required production files

- Table: `t/plate.png`
- Passing anchors: `p/a.json`
- Passing overlay: `p/o.png`
- Slots only: `p/s.png`
- Arrows only: `p/r.png`
- Debug overlay, dev only: `p/d.png`
- Card map: `c/map.json`

## Passing lanes are locked

Read `p/a.json`. Do not infer lanes from seat or camera. There are exactly 12 anchors.

```txt
north_pass_left    -> arrow left,  landscape, rot 0
north_pass_across  -> arrow south, portrait,  rot 0
north_pass_right   -> arrow right, landscape, rot 0

south_pass_left    -> arrow left,  landscape, rot 0
south_pass_across  -> arrow north, portrait,  rot 0
south_pass_right   -> arrow right, landscape, rot 0

east_pass_north    -> arrow north, portrait,  rot -90
east_pass_across   -> arrow west,  landscape, rot +90
east_pass_south    -> arrow south, portrait,  rot +90

west_pass_north    -> arrow north, portrait,  rot -90
west_pass_across   -> arrow east,  landscape, rot +90
west_pass_south    -> arrow south, portrait,  rot +90
```

Important side-seat rule: **east/west north and south lanes are vertical; east/west across lanes are horizontal.** Use `slot_orientation` and `slot_rotation_deg` from `p/a.json` directly.

Use `polygon_px` for hit testing, with `bbox_px` fallback.

## Passing interaction

During exchange/passing phase:

1. Show `p/o.png` over the table.
2. User selects exactly 3 cards.
3. User assigns one card to each lane.
4. Dropping onto a lane binds to that exact anchor `id`.
5. One card per lane. If a filled lane receives another card, replace unless existing UX has swap behavior.
6. Render assigned cards above the slot, preserving card aspect ratio.

## Cards

Use real PNG cards from `c/`; do not make placeholders.

- Standard: `c/std/{sw|pg|jd|st}_{A|K|Q|J|10|9|8|7|6|5|4|3|2}.png`
- Specials: `c/sp/{mahjong|dog|phoenix|dragon}.png`
- Backs: `c/back/{blue|green}.png`

Use `c/map.json` if you want an explicit lookup.

## Tests to add

- Asset root resolves to `tichu_v6`.
- Table path is `t/plate.png`.
- Production passing anchor path is `p/a.json`.
- Production passing overlay path is `p/o.png`.
- There are exactly 12 anchors.
- All direction/orientation/rotation values match the map above.
- East/west north/south are portrait; east/west across are landscape.
- `getTableTransform` uses one uniform scale.
- Production code does not import old v3/v4/v5 files or debug overlay.
- Card resolver finds 52 standard cards, 4 special cards, and 2 backs.

## Verification

Run:

```bash
python3 x/verify.py .
```

Then run this repo's lint, typecheck, tests, and build.

Report the changed files, asset root, exact paths used, and checks run.
