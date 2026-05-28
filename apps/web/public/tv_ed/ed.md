# Tichu Anchor Editor

Open `ed.html` from a local web server while the assets are in this folder.

```powershell
cd C:\tichu\tichuml\apps\web\public\tv15
python -m http.server 8787
# open http://localhost:8787/ed.html
```

Use it to nudge/rotate/scale these layers:

- `h/a.json` hand/card anchors
- `p/a.json` passing anchors
- `k/a.json` virtual trick anchors
- `h/rack.json` rack/channel zones

Use `Patch` to download `anchor_patch.json`, then apply it in the same folder:

```powershell
node x/apply.mjs anchor_patch.json .
node x/check.mjs .
```

Keyboard:

- Click anchor to select
- Shift-click for multi-select
- Arrow keys nudge selected anchors
- Shift + arrows = bigger nudge
- Ctrl/Cmd + arrows = fine nudge
- `[` / `]` rotate shape
- `,` / `.` rotate card metadata only
- `Delete` clears selection

Important: this editor stores geometry in design pixels for a fixed `1536 × 1024` table. Runtime should use contain-fit scaling, never independent X/Y stretch.
