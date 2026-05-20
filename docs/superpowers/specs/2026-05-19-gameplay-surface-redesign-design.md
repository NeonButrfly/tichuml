# Gameplay Surface Redesign Design

- Date: 2026-05-19
- Linked GitHub Issue: [#74](https://github.com/NeonButrfly/tichuml/issues/74)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only

## Summary

This design replaces the current flatter live gameplay table presentation with a
player-first adaptive dual-surface model. The main game surface should feel like
playing Tichu at a real premium table from the south player's seat, while
operator and diagnostic detail move into a separate analysis-oriented surface
instead of competing with the live table.

The redesign is visual and structural, but it must not change game rules,
decision legality, telemetry contracts, or backend behavior. The goal is to
improve table identity, emotional impact, and gameplay clarity without
regressing the current working live game loop.

## Goals

- Make the live game feel like a physical authored Tichu table rather than a
  generic web layout.
- Keep the table player-first, with minimal always-on information during normal
  play.
- Use an over-hand south-player perspective for the primary live surface.
- Support automatic visual mode changes so atmosphere can increase during calm
  moments and readability can take priority during active decisions.
- Preserve a clean path to rich diagnostics through a separate operator view.
- Establish a custom Tichu-native deck language and elevated special-card
  treatment.

## Non-Goals

- No rules or scoring changes.
- No hidden fallback gameplay behavior or server-side contract drift.
- No attempt to merge operator diagnostics into the player table as permanent
  overlays.
- No requirement to complete the full redesign in one implementation step.

## Approved Direction

The approved direction is `Adaptive Dual-Surface`.

### Core Decisions

- Primary audience: player-first, with operator mode available behind a toggle.
- Default live composition: south-player over-hand perspective.
- View behavior: auto mode. Calm moments can feel more cinematic, but active
  decision moments must simplify automatically.
- Environment: studio-clean, table-only presentation.
- Opponent visibility: minimal by default.
- Controls: hidden until an action is available.
- Table surface: mostly bare felt with very light or no printed guides.
- Turn emphasis: dramatic and intentional when the acting player changes.
- Deck treatment: fully custom, Tichu-native authored deck.
- Special-card treatment: elevated and ceremonial, but still readable.
- Operator mode: separate full analysis surface rather than inline overlays.

## Surface Model

The redesign uses two intentionally different surfaces:

1. `Player Surface`
   - The normal live game presentation.
   - Immersive, sparse, and built around table presence.
   - Shows only essential state unless the player needs to act.

2. `Operator Surface`
   - A separate analysis-oriented mode entered explicitly by toggle.
   - Prioritizes state visibility, diagnostics, and operational control.
   - Can be flatter and denser because it is not the primary emotional surface.

This separation keeps the live table beautiful and focused while preserving
space for serious debugging and inspection.

## Player Surface

### Camera and Composition

The player surface should be anchored to a believable over-hand south-player
view. The table is the hero element and should occupy most of the viewport. The
scene should feel grounded in a real object:

- visible rail and felt
- restrained premium materials
- strong negative space in the center play area
- seat positions that read immediately without adding dashboard framing

The composition should avoid large headers, persistent side panels, or other
app-like chrome that competes with the table.

### Information Density

Normal play should stay intentionally sparse:

- seat labels only where needed
- minimal opponent metadata
- no always-on operator diagnostics
- no strong printed casino-style zones across the felt

Cards, motion, and turn cues should carry most of the structure.

### Control Strategy

Controls should not behave like permanent HUD furniture. They should appear only
when an action is available and otherwise stay out of the way. In the player
surface, the default experience should feel like looking at a table, not a menu
system.

When controls appear, they should use a restrained low-center action treatment
that is visually subordinate to the cards and trick area.

## Adaptive State System

The player surface must support three visual states.

### Calm State

Used during setup, waiting, and other low-pressure moments.

- more immersive hand presentation
- slightly richer atmosphere
- more tactile over-hand framing

### Decision State

Used when the local player must act or a decision becomes time-sensitive.

- hand view simplifies automatically
- unnecessary ornament recedes
- available actions become obvious
- active trick and legal play area become easier to parse

This state exists to guarantee usability without abandoning the cinematic base
surface.

### Resolution State

Used for brief, high-energy events:

- trick win and collection
- wish-driven pressure
- bomb interruption
- special-card tempo shift

This state can use one stronger dramatic cue, but it must remain temporary and
return the surface cleanly to calm or decision mode.

## Turn Emphasis

Active-turn signaling should be dramatic because the rest of the surface is
restrained. The table should not accumulate extra labels or widgets to show who
is acting. Instead, the design should use a stronger intentional emphasis such
as:

- focused seat glow
- directional lighting or motion emphasis
- temporary acting-player cue near the relevant seat or card area

The cue must feel authored, not like a generic notification badge.

## Deck Language

The deck should be redesigned as a custom Tichu-native visual system.

### Normal Cards

- must remain learnable without relying on the current standard deck styling
- should use a coherent internal language for rank, family, and hierarchy
- should feel premium and authored, not like template icons on white cards

### Special Cards

Dragon, Phoenix, Dog, and Mahjong should feel elevated and ceremonial relative
to normal cards. They must stand out quickly on the table while preserving fast
play readability.

The special-card treatment should aim for recognition speed first and decorative
richness second.

## Operator Surface

Operator mode should be treated as a deliberate surface switch, not an overlay
stack on the cinematic table.

When toggled on, the system should transition from player mode to an analysis
mode that can show:

- clearer seat-level state
- richer control affordances
- diagnostics and backend-facing context
- operator-only inspection tools

The operator surface can use a more explicit UI layout because it is solving a
different job. It should reuse the same gameplay truth, but not the same visual
restraint.

## Implementation Boundaries

Implementation should be phased to reduce gameplay risk.

### Phase 1 - Table Composition

- rebuild the live table composition and camera/view framing
- establish the player-first physical-table presentation
- preserve current gameplay function while replacing the visual shell

### Phase 2 - Adaptive State Behavior

- add calm, decision, and resolution presentation changes
- keep triggers tied to existing gameplay state rather than new heuristics

### Phase 3 - Deck and Asset System

- replace current card visuals with a custom authored deck
- introduce special-card treatment
- ensure readability validation remains part of the rollout

### Phase 4 - Operator Surface

- create a distinct analysis surface behind the operator toggle
- move operator diagnostics out of the player table

## Error Handling and Safety

- If the richer player presentation causes readability or responsiveness issues,
  decision-state simplification must win.
- If a visual mode fails, the game must continue with a safe readable fallback
  presentation rather than breaking live play.
- Operator mode must not alter gameplay truth or action legality; it is a view
  change, not a game-state change.

## Validation Plan

- Browser-level smoke validation for live gameplay start, action availability,
  trick readability, and active-turn emphasis.
- Regression checks around pass lanes, trick display, and live gameplay flow so
  existing open 6.4 items are not made worse by the redesign.
- Visual validation for calm, decision, and resolution states.
- Validation that operator mode transitions cleanly to a separate surface and
  back without leaving stale UI state.
- Asset validation for deck readability, especially special cards and fast
  decision moments.

## Documentation and Tracking Requirements

- Keep [#74](https://github.com/NeonButrfly/tichuml/issues/74) as the canonical
  source of truth for this redesign.
- Capture the approved prompt direction in `docs/prompts/ui.md`.
- Keep implementation work under milestone `6.4 – Gameplay & UX Stabilization`.
- Do not describe progress in docs that is not reflected in GitHub issue state.
