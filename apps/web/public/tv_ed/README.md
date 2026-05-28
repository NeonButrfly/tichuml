# tichu_v15

Short-path layered Tichu table pack. Extract directly to `apps/web/public/tv15`.

This iteration keeps the card math that lined up correctly in tv14 and fixes east/west passing targets.

Core files:

- `t/base.png` clean 3D table base.
- `t/dragon.png` transparent lower-layer gold dragon motif.
- `h/a.json` dynamic hand-card anchors.
- `h/math.json` frozen card math lock.
- `h/rack.json` physical card rack/channel zones.
- `p/a.json` passing anchors; east/west are angled polygons following the rail.
- `p/o.png` math-drawn passing overlay.
- `k/a.json` virtual trick anchors only.
- `x/check.mjs` validator.

Dynamic components are not image-generated. Preview overlays are drawn from JSON math.
