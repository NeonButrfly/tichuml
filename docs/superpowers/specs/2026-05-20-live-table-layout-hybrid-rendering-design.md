# Live Table Layout Hybrid Rendering Design

- Date: 2026-05-20
- Linked GitHub Issue: [#76](https://github.com/NeonButrfly/tichuml/issues/76)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only

## Summary

This design refines the live South-player Tichu table into a cleaner,
spatially-anchored, more readable surface while preserving the existing game
logic, hotkeys, telemetry, backend contracts, and layout editor behavior. The
table should remain a single-viewport playable Tichu surface, but it should
feel less flat, waste less space, and reserve stable room for trick play,
passing, wishes, and seat-associated Tichu state.

The approved direction is a hybrid rendering approach. The current React layout
and geometry system stays authoritative, while a focused graphics layer can be
introduced for table depth, seat anchoring, and richer card/table assets
without creating a second competing coordinate system.

## Goals

- Keep South as the dominant hand and ensure it is never obscured by controls
  or labels.
- Reduce dead center felt space while preserving a calm, readable trick area.
- Pull East and West inward from viewport edges and anchor them more naturally
  to the table.
- Make all four seat labels consistent and readable from the South-player
  perspective.
- Associate Tichu and Grand Tichu call state with seats instead of relying only
  on center text.
- Reserve stable geometry for future pass lanes, trick staging, wish display,
  and turn indicators so phase changes do not cause layout jumps.
- Add more depth and authored visual identity without turning the game into
  poker, casino UI, or a non-playable faux-3D scene.

## Non-Goals

- No gameplay-rule changes.
- No score, trick-resolution, Dog, wish, passing, or backend-decision contract
  changes.
- No scrolling gameplay surface.
- No poker chips, betting rails, draw deck, discard piles, Mahjong board zone,
  or generic casino markings.
- No renderer rewrite that replaces the authoritative runtime and layout model.

## Approved Direction

The approved direction is `Hybrid Graphics Layer`.

### Core Decisions

- Keep the existing live gameplay runtime authoritative.
- Do not create a second coordinate system.
- Use the current layout/editor model as the single source of truth for seat
  anchors, safe insets, pass-lane placement, trick staging, and action-band
  clearance.
- Allow a focused rendering layer for table/felt/rim depth and richer card
  assets, but keep React in control of gameplay state and interaction.
- Maximize usable table space while keeping a subtle South-player perspective.

## Runtime Boundary

### Authoritative Systems

The following remain authoritative and must not be forked or shadowed:

- gameplay state and phase logic
- table layout persistence and editor behavior
- hotkeys, including `Ctrl-E` and `Ctrl-D`
- backend settings, health, and decision requests
- telemetry and simulator compatibility
- seat-relative pass/exchange semantics

Any visual layer must render from the same computed seat and surface geometry
that the current table runtime already uses.

### Rendering Boundary

The rendering layer may own:

- felt and rim visuals
- anchored seat shadows and glows
- card-face and card-back asset rendering
- turn emphasis visuals
- trick-area decoration and staging presentation
- faint pass-lane and wish-region affordances

The rendering layer must not own:

- action legality
- seat logic
- phase transitions
- drag/drop truth
- score truth
- debug/operator state truth

## Safe Table Geometry

The layout system should normalize around one safe table rectangle with
explicit regions:

- `top safe inset`
  - preserves room for menu and score
- `bottom safe inset`
  - preserves room for the South hand and the action row with no overlap
- `side safe insets`
  - protect East and West from edge clipping
- `center safe zone`
  - reserves room for current trick, wish display, and center-phase messaging

Every seat, badge, lane, and control should resolve from these shared
constraints rather than individual ad hoc nudges.

## Seat Model

### South

South is always the primary visual element. The hand must scale from 8 cards to
14 cards and remain fully visible above the bottom control area. South needs:

- a higher hand anchor than the current version
- a reserved bottom-safe-zone buffer
- a consistent `SOUTH · You` label
- a seat-associated turn marker
- seat-associated Tichu and Grand Tichu state

### North

North should remain centered and readable as `NORTH · Partner`, with stable
space for call markers and pass/exchange lanes. North should feel anchored to
the table, not floating independently over the felt.

### East and West

East and West should move inward from the viewport edges and use consistent
badge placement rather than awkward vertical or edge-clamped labels. The live
player surface should present:

- `EAST · Opponent`
- `WEST · Opponent`

These labels should sit near the hands inside safe table bounds, ideally
between the hand and the center or just outside the hand while still anchored
to the same seat region.

## Perspective and Space

The table should feel like a subtle South-player tabletop view rather than a
flat top-down grid. The approved perspective is restrained:

- mild vertical compression toward North
- slight side-seat perspective treatment
- soft depth through shadows, rim, and seat anchoring
- no dramatic camera tilt that harms card readability

The center should no longer be a huge empty field. Instead, the table should
use space intentionally:

- larger and cleaner than a crowded UI
- smaller and more anchored than the current empty expanse
- ready to hold trick, wish, and phase information without shifting seat
  geometry

## Trick, Wish, and Pass Regions

### Current Trick Zone

A central `Current Trick` region should exist at all times, even when empty.
During the Grand Tichu window it may be visually quiet, but the geometry must
remain reserved so later trick play does not cause layout jumps.

### Wish Region

A small wish indicator region should live near the upper-left of the trick
area. It should remain hidden when no wish exists and appear only when the
runtime says a wish is active.

### Pass and Exchange Lanes

Lane anchors should exist for all seats even when visually dormant:

- South: left, partner, right
- North: mirrored
- East and West: aligned to side-hand orientation

The lanes may remain faint or hidden outside pass flow, but the geometry should
already be part of the surface so pass/exchange phases do not cause collisions
or layout drift.

## Seat-Associated State

The following states should be visibly tied to seat anchors:

- `T` called
- `GT` called
- unavailable or declined state if the runtime exposes it
- active turn emphasis

Center text may remain for phase guidance such as `Your turn`, but seat-level
state should not rely on the center alone.

## Graphics and Assets

### Asset Strategy

The visual pass should rely on authored assets where they materially improve the
surface:

- felt and rim assets
- card backs
- upgraded card fronts
- special-card treatments
- seat-associated markers and turn/wish affordances

### Card Visibility

- In normal player mode, South cards are face-up and readable.
- North, East, and West should use backs or count-only behavior unless
  debug/spectator mode explicitly reveals them.
- Debug/spectator reveal may remain available, but it must not become the
  default player presentation.

### Visual Style

- keep the green felt family
- add subtle depth and anchored shadows
- avoid photorealistic faux-3D
- avoid casino or poker visual language
- keep the surface recognizably Tichu-specific

## Library Boundary

The repo is not currently Pixi-powered, so introducing a graphics library would
be additive rather than a refactor of an existing renderer. If a rendering
library is adopted for this pass, it must be used as a bounded presentation
layer inside the existing React table surface.

That means:

- React owns state, layout, controls, and view switching
- the graphics layer consumes computed geometry and visual state
- no second independent board-space model is introduced

If this boundary cannot be preserved cleanly, the implementation should prefer
the existing renderer plus generated assets over a destabilizing library
adoption.

## Validation Plan

The final implementation must be validated at:

- 1366x768
- 1440x900
- 1600x900
- 1920x1080

### Required checks

- South hand fully visible
- South label fully visible
- bottom buttons do not cover South cards
- East and West hands are inside safe bounds
- East and West labels do not overlap cards
- North hand and label remain centered and readable
- score stays visible near top center
- current phase text remains readable
- current trick zone remains visible
- reserved room remains available for wish and pass lanes

### State-specific checks

- Grand Tichu window with 8-card hands remains clean
- full 14-card hands remain readable and unclipped
- normal player mode keeps only South face-up by default
- debug or spectator reveal remains available without changing the default

### Regression checks

- no passing regression
- no wish-logic regression
- no Dog-flow regression
- no scoring regression
- no telemetry or backend-request regression
- no layout drift between persisted layout and runtime rendering

## Documentation and Tracking Requirements

- Keep [#76](https://github.com/NeonButrfly/tichuml/issues/76) as the
  canonical source of truth for this refinement.
- Keep the work under milestone `6.4 – Gameplay & UX Stabilization`.
- Capture the approved prompt in `docs/prompts/ui.md`.
- Do not claim renderer migration or asset completion in docs unless the code
  and GitHub issue state actually reflect that reality.
