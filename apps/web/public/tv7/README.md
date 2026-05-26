# tichu_v7

Short-path complete Tichu alt-table asset pack.

## Files

```txt
t/plate.png      clean-ish base table plate for dynamic cards
t/ref.png        original prototype reference table
p/a.json         locked passing anchors
p/o.png          passing overlay slots+arrows
h/a.json         card location anchors, same idea as passing anchors
h/s.png          card slot overlay
h/d.png          labelled card slot debug overlay
h/prev/table.png card slots on table preview
h/prev/all.png   card + passing slots on table preview
c/               real card images
x/check.mjs      fail-fast validator
codex.md         Codex start-clean instructions
lock.json        immutable short lock
```

## Validate

```bash
node apps/web/public/tv7/x/check.mjs apps/web/public/tv7
```

Expected: `OK tichu_v7`.

Codex should extract this zip to `apps/web/public/tv7` and use `/tv7` as URL root.
