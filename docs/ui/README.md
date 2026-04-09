# UI Docs

The game UI is designed around a single-screen, no-scroll table layout with explicit phase surfaces.

## Table Principles

- fit the game screen to the viewport
- keep all four hands, center table, score, and action rail visible at once
- preserve card aspect ratio and readable fanning
- keep pass-lane geometry aligned with the table editor layout
- show the current trick point total centrally while a trick is active
- keep live played cards in seat-local trick areas instead of a shared center pile
- avoid masking overflow instead of truly fitting content

## Interaction Principles

- the engine decides legality; the UI decides presentation
- exchange, pickup, and trick-play states should render different controls
- active Mahjong wishes should remain visible in normal gameplay chrome without obscuring the table
- Play, Pass, and Tichu button states should come from one shared turn-action helper derived from engine legal actions
- selected cards must match legal play variants through the engine's shared canonical combo-card ordering, never through ad hoc UI sorting
- no active response turn may leave Tichu as the only progression action because of legality or matching drift
- hotkeys, menu actions, and dialogs should route through shared command handlers
- debug and inspection UI should not leak into normal gameplay unexpectedly
- trick lanes should present cards only; directional indicators are intentionally removed from live trick rendering
- received exchange cards should remain staged in the pickup lane until the player explicitly clicks Pickup
- pass-selection and pass-reveal cards must render in dedicated directional pass lanes only, never inside hand fans
- exchange rendering must keep every card in exactly one visible bucket: hand, pass lane transit, or pickup staging
- Dog lead transfer visuals should follow the engine-resolved recipient, not a UI-only guess
- Tichu and Grand Tichu seat markers should render as compact `T` / `GT` glyphs positioned relative to the hand band
- play-area inset shadow is editor-only so gameplay keeps a cleaner center surface
- the blurred center felt layer is editor-only; gameplay should not mount any duplicate glow layer there
- active response turns must always resolve through a legal play or a legal pass, never by pausing on optional Tichu alone

## Overlay And Dialog Guidance

- dialogs must stay centered and internally scrollable when needed
- opening a menu or modal must not introduce page scrolling
- debug surfaces should show bounded values and concise metadata
- copyable values should use monospace fields with reliable full-value access

## Related Surfaces

- table editor
- hotkeys dialog
- how-to-play dialog
- random-sources dialog
- score/history surfaces

Update this document when layout rules or core UI interaction contracts change.
