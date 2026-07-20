# Codex task: clean alt table from tv7 assets

Use only the short asset pack extracted at `apps/web/public/tv7`.

First run:

```bash
node apps/web/public/tv7/x/check.mjs apps/web/public/tv7
```

If this fails, fix extraction before UI work.

## Non-negotiable architecture

Build the alt table as layered 2D images. Do **not** build a CSS/3D/procedural table.

Runtime URL root: `/tv7`

Required layers:

1. table plate: `/tv7/t/plate.png`
2. dynamic cards positioned from `/tv7/h/a.json`
3. passing overlay during passing phase: `/tv7/p/o.png`
4. passing hit targets from `/tv7/p/a.json`
5. dev debug overlays only when explicitly enabled: `/tv7/h/d.png`, `/tv7/p/d.png`

The old problem was treating table cards as background art and then rendering generic hand rows. Do not do that. `h/a.json` is now the card location layer, exactly like `p/a.json` is the passing lane layer.

## Coordinates

All assets use `1536 x 1024` design coordinates. Use one contain-fit transform for table, cards, passing lanes, hit targets, drag/drop, and snapshots.

```ts
const DESIGN_W = 1536;
const DESIGN_H = 1024;
function fit(w:number,h:number){
  const scale=Math.min(w/DESIGN_W,h/DESIGN_H);
  return {scale, offsetX:(w-DESIGN_W*scale)/2, offsetY:(h-DESIGN_H*scale)/2};
}
```

No separate flex rows. No viewport-relative card placement.

## Card layout

Load `/tv7/h/a.json`. Render all hand/deck/discard cards by anchor id.

Each card anchor has:

- `id`
- `zone`
- `seat`
- `center_px`
- `bbox_px`
- `polygon_px`
- `w_px`
- `h_px`
- `rotation_deg`
- `layout_source: prototype_layer`

Every rendered card element must include:

```html
data-card-id="..."
data-zone="south_hand|north_hand|east_hand|west_hand|deck|discard|passing"
data-layout-source="prototype_layer"
```

At deal 8 and deal 14, every normal hand card must occupy a corresponding hand anchor from `h/a.json`. Do not use CSS flexbox rows/columns for the actual table hand positions.

## Passing lanes

Keep the passing config already fixed. Load `/tv7/p/a.json` only.

Locked pass map:

```txt
north_pass_left     left   landscape 0
north_pass_across   south  portrait  0
north_pass_right    right  landscape 0
south_pass_left     left   landscape 0
south_pass_across   north  portrait  0
south_pass_right    right  landscape 0
east_pass_north     north  portrait -90
east_pass_across    west   landscape 90
east_pass_south     south  portrait 90
west_pass_north     north  portrait -90
west_pass_across    east   landscape 90
west_pass_south     south  portrait 90
```

Do not reinterpret this.

## Demo flow required

Implement or repair the alt route so it shows:

`ready -> deal8 -> grand_tichu -> deal6 -> passing -> passed`

- deal 8 cards to north/east/south/west using card anchors
- show Call GT / Skip GT
- deal 6 more, ending at 14 cards each
- enter passing
- show `/tv7/p/o.png`
- create 12 dynamic pass hit targets from `/tv7/p/a.json`
- South can assign exactly 3 cards to south pass lanes
- add `Auto demo pass` to fill all 12 pass lanes for visual inspection

Cards must use real PNGs from `/tv7/c/`, never placeholders.

## Runtime snapshot

Expose `window.__tichuV7Snapshot()` with:

```ts
{
  assetRoot:'/tv7',
  table:{src:'/tv7/t/plate.png', designW:1536, designH:1024, rendered:{x,y,width,height,scale}},
  cardLayout:{src:'/tv7/h/a.json'},
  passing:{overlaySrc:'/tv7/p/o.png', anchors:[...]},
  cards:{usingImageAssets:true, placeholders:false, layoutSource:'prototype_layer', bySeat:{north:[],east:[],south:[],west:[]}},
  deal:{phase, counts:{north,east,south,west,deckRemaining}, history:[]}
}
```

Then emit `alt_table_snapshot.json` in browser verification if possible and run:

```bash
node apps/web/public/tv7/x/check.mjs apps/web/public/tv7 --snap alt_table_snapshot.json
```

## Fail-fast tests

Add tests that fail if:

- `/tv7/t/plate.png` is not used
- `/tv7/h/a.json` is not used for card positions
- hand cards render with flex/generic rows instead of anchors
- any card has `data-layout-source` other than `prototype_layer`
- cards do not use `/tv7/c/` image assets
- passing lane directions/rotations differ from lock
- east/west across passing lanes are not horizontal
- east/west north/south passing lanes are not vertical
- deal flow is not 8 -> GT -> 6 -> passing

Run before done:

```bash
node apps/web/public/tv7/x/check.mjs apps/web/public/tv7
npm run lint
npm run test
npm run build
npm run verify:browser:alt
```

Report exact route, changed files, and command results.
