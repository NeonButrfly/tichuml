# Fresh ALT Table Editor Design

- Date: 2026-06-14
- Linked GitHub Issue: [#100](https://github.com/NeonButrfly/tichuml/issues/100)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only

## Summary

This design turns the existing `apps/table-editor` workspace into a faithful
authoring tool for the Fresh ALT luxury table instead of a generic preview
scene. The editor must stay a separate Vite application on port `5178`, render
the same table surface as the production `FreshAltTable`, and let layout work
happen without embedding editor controls into live gameplay.

The approved direction is to keep `apps/table-editor` isolated as its own app
while replacing its approximate preview renderer with a detached authoring
wrapper around the shared Fresh ALT table surface. The editor should support
manual export for now so authored values can be copied into production defaults
deliberately while the live table is still being tuned.

## Goals

- Keep the editor as a standalone app in its own repo directory.
- Make the editor preview an exact visual copy of the current Fresh ALT luxury
  table surface.
- Support editing `north`, `east`, and `west` hand transforms against the real
  luxury table.
- Support editing `north`, `east`, and `west` fan settings where the production
  luxury table needs them.
- Keep `south` visible as the reference hand but lock it against edits.
- Support editing every individual passing-lane overlay.
- Support editing every individual passing-lane arrow.
- Export stable layout JSON that can be applied manually to production table
  defaults.

## Non-Goals

- No gameplay-mode editor route.
- No editor controls inside the live game UI.
- No dependency on a running gameplay session.
- No automatic production layout ingestion yet.
- No changes to gameplay rules, turn flow, telemetry, backend routing, or bot
  logic.
- No changes that pull editor-only dependencies into the normal game bundle.

## Approved Direction

The approved direction is `Standalone app with shared Fresh ALT authoring
surface`.

### Core Decisions

- Keep `apps/table-editor` as the only editor entrypoint.
- Reuse the Fresh ALT rendering path as the editor preview source of truth.
- Separate authoring state from gameplay state.
- Treat exported JSON as the production handoff artifact for now.
- Lock `south` in the editor even though it remains present in the shared
  layout schema.

## Architecture

### App Boundary

`apps/table-editor` remains a fully separate Vite app with its own:

- `package.json`
- `vite.config.ts`
- `index.html`
- TypeScript config
- editor entrypoint
- editor styles
- editor state and history
- import and export workflow

The root workspace command stays:

- `npm run editor:table`

and must start only the editor on port `5178` with:

```ts
server: {
  port: 5178,
  strictPort: true
}
```

The normal game command must continue starting only the game.

### Preview Boundary

The current editor preview should stop rendering a generic table-plus-mesh
scene. Instead, the editor mounts a shared authoring wrapper around the Fresh
ALT surface so the viewport matches the same:

- table art
- hand anchoring rules
- pass-lane geometry
- arrow placement
- card orientation assumptions
- overall visual proportions

This wrapper must stay gameplay-free. It can render representative cards and
lanes from authoring data, but it must not import or depend on:

- match state
- turn state
- networking
- bots
- scoring
- trick logic
- passing-phase reducers
- production routing

### Shared Modules

The editor may share small runtime-safe modules with production:

- layout schema and validation
- layout defaults
- transform helpers
- fan math
- lane and arrow math
- asset references
- Fresh ALT geometry helpers
- authoring-safe rendering helpers

The editor should not duplicate those helpers in editor-only files if the same
logic already exists in Fresh ALT code and can be cleanly reused.

## Editable Data Model

### Shared Layout Contract

Use one shared layout schema as the export contract. The editor should not
invent a second production-layout format.

The exportable layout data should cover:

- `hands.north`
- `hands.east`
- `hands.west`
- `hands.south`
- `passingLanes.<laneId>`

The shared layout remains structurally complete so preview and production can
reason about one consistent object shape.

### Editable vs Locked Data

Editable in the editor:

- `hands.north.master`
- `hands.east.master`
- `hands.west.master`
- `hands.north.fan`
- `hands.east.fan`
- `hands.west.fan`
- every `passingLanes.<id>` overlay transform and presentation field
- every `passingLanes.<id>` arrow transform field

Visible but locked in the editor:

- `hands.south`

Editor-only, never exported:

- selection state
- undo and redo history
- viewport controls
- lock metadata
- local autosave bookkeeping

### Rotation Contract

Rotations may remain stored as radians in exported JSON, but the property UI
should present them as degrees for readability. Conversion must always pass
through explicit helpers; the editor should not mix degrees and radians
informally.

## Editor UX

### Selection Model

The scene hierarchy and property panel should make the editable boundary
obvious:

- `North Hand`
- `East Hand`
- `West Hand`
- `South Hand (Locked)`
- grouped passing lanes by seat
- grouped arrow nodes by seat and lane

Attempting to edit `south` should either do nothing or show a clear locked
state, but it must not silently mutate export data.

### Property Editing

For editable hands, the property panel should expose:

- position `x/y/z`
- rotation `x/y/z` in degrees
- scale `x/y/z`
- pivot `x/y/z`
- fan count
- card width
- card height
- overlap
- spread
- arc
- depth step
- local rotation step
- start offset
- fan direction
- reverse order

For lanes and arrows, the panel should expose individual transform and
presentation values without requiring seat-group edits or mirrored batch edits
to be the only workflow.

### Export Convenience

Because production application is manual for now, the editor should support:

- full layout export
- import from JSON
- reset to defaults
- local autosave
- a convenient way to copy one edited section such as `hands.east` or
  `passingLanes.east-across`

That partial-copy workflow reduces mistakes during manual production updates.

## Production Handoff

The short-term handoff stays manual:

1. Tune the exact Fresh ALT surface in `apps/table-editor`.
2. Export layout JSON.
3. Copy the chosen values into the production Fresh ALT defaults or mapping
   layer.
4. Verify the production luxury table reflects those values.

The production table should not automatically ingest editor exports in this
phase. That follow-up can happen later once the authoring loop is proven and
the final production read path is chosen intentionally.

## Validation

This work should be considered complete only if both authoring fidelity and
handoff fidelity are demonstrated.

### Required Verification

- The standalone editor starts on `http://localhost:5178`.
- Port `5178` stays strict and does not silently roll forward.
- The editor preview matches the Fresh ALT luxury table surface closely enough
  that edits can be trusted.
- `north`, `east`, and `west` edits visibly affect the same luxury-table
  presentation that production uses.
- `south` remains visible and locked.
- Every passing lane and every arrow can be selected and edited individually.
- Exported JSON validates against the shared schema.
- Exported JSON round-trips through import and export without drift.
- Applying exported values manually to production improves the real luxury
  table without regressing the normal table.

### Tests

Implementation should add or update targeted coverage for:

- shared layout schema validation
- locked-south editor behavior
- import and export round-trips
- editor preview wiring to shared Fresh ALT layout data
- production Fresh ALT consumption of the tuned values

### Manual Checks

- Start the editor independently.
- Move `east`, `west`, and `north` hands and confirm visible changes.
- Adjust fan settings and confirm the preview reflects the change.
- Edit several lane overlays and arrows individually.
- Export JSON and inspect it for stable structure and readable grouping.
- Apply a small subset of values to production and verify the real Fresh ALT
  table matches expectations.

## Risks and Mitigations

### Drift Between Editor and Production

Risk: the editor becomes approximate again after future table changes.

Mitigation: prefer shared Fresh ALT authoring helpers over duplicated preview
rendering code, and keep validation focused on exact preview parity.

### South-Hand Accidental Mutation

Risk: south appears editable because it exists in the shared schema.

Mitigation: enforce editor-side lock rules in hierarchy, properties, and
mutation helpers, and add tests for south immutability from editor actions.

### Over-Coupling to Gameplay Runtime

Risk: the editor becomes dependent on production table state or game routes.

Mitigation: keep a detached authoring wrapper with representative data and only
import runtime-safe geometry, asset, and transform helpers.

## Implementation Notes

- Favor reusing the Fresh ALT rendering path over extending the current generic
  editor meshes.
- Preserve the standalone workspace boundary of `apps/table-editor`.
- Keep all editor-only dependencies out of the normal game bundle.
- Leave automatic runtime consumption of exported layout JSON for a later
  follow-up once manual authoring proves the right shape.
