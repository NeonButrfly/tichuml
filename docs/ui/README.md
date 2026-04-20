# UI Docs

The game UI is designed around a single-screen, no-scroll table layout with explicit phase surfaces.

## Table Principles

- fit the game screen to the viewport
- keep all four hands, center table, score, and action rail visible at once
- preserve card aspect ratio and readable fanning
- route normal-mode geometry through one canonical schema module (`apps/web/src/table-layout.ts`) before rendering
- treat the normal table board as the authoritative rectangular play surface for score, seats, center play/status, pass lanes, and the south action row
- derive `northSeat`, `eastSeat`, `southSeat`, and `westSeat` anchors from the canonical table geometry before placing hands, labels, and exchange lanes
- keep pass-lane geometry aligned with the same seat-anchor geometry used by the table editor overlay
- use shared table spacing tokens for label gaps, badge gaps, hand-to-lane clearance, lane spacing, lane-to-stage clearance, action-row separation, score clearance, and edge inset
- show the current trick point total centrally while a trick is active
- keep live played cards in seat-local straight stage areas instead of a shared center pile or arc/fan arrangement
- avoid masking overflow instead of truly fitting content

## Interaction Principles

- the engine decides legality; the UI decides presentation
- exchange, pickup, and trick-play states should render different controls
- active Mahjong wishes should remain visible in normal gameplay chrome without obscuring the table
- when the local player must choose a Mahjong wish, the UI should open a centered modal dialog with a vertical rank selector, default to `No Wish`, keep `No Wish` as the first in-list option, and expose no freeform text input path
- Play, Pass, and Tichu button states should come from one shared turn-action helper derived from engine legal actions
- selected cards must match legal play variants through the engine's shared canonical combo-card ordering, never through ad hoc UI sorting
- no active response turn may leave Tichu as the only progression action because of legality or matching drift
- seat name labels, call badges, turn badges, and out badges should render from canonical seat-anchor geometry instead of seat-local pixel tweaks
- east and west labels must be derived from side hand bounds: east uses `hand.right + padding`, west uses `hand.left - padding`, and both are vertically centered on the hand
- north identity stacks below the top-center score in the order score, gap, north label, gap, north hand; south labels sit below the south hand; action controls sit below the south identity zone
- east and west hands should keep the current side-seat fan layout and rotate only the card elements: east cards face left, west cards face right, and the side hand containers remain fixed
- received pickup cards should render from seat-local pickup anchors, not a shared center pile
- north hand corrections should stay local to north card elements and the north fan spread; south hand geometry remains locked
- played cards should render from seat-local trick anchors on straight axes and may only be tightened slightly toward the owning seat on one axis without moving the rest of the table geometry
- hotkeys, menu actions, and dialogs should route through shared command handlers
- debug and inspection UI should not leak into normal gameplay unexpectedly
- trick lanes should present cards only; directional indicators are intentionally removed from live trick rendering
- received exchange cards should remain staged in the pickup lane until the player explicitly clicks Pickup
- during `exchange_complete`, east and west received-card lanes should stack on one shared side-seat centerline so each lane frame and its card stay visually centered while the cards remain attached to the directional pass lanes
- during `exchange_complete`, pickup stacks remain centerlined, but the filled pickup cards rotate by rendered lane arrow only: north/south rows use `left / upright / right`, west uses `up / right / down`, and east uses `up / left / down`
- pass-selection and pass-reveal cards must render in dedicated directional pass lanes only, never inside hand fans
- directional pass lanes should preserve a stable alignment pattern: south lanes form a bottom-aligned `< ^ >` row above the south hand, north lanes form a top-aligned `< v >` row below the north hand, east lanes form a right-aligned `^ < v` column left of the east hand, and west lanes form a left-aligned `^ > v` column right of the west hand
- the visible pass-slot surfaces should rotate at the element level while the lane groups stay fixed: north-facing and west-facing destinations use `-90deg`, south-facing and east-facing destinations use `+90deg`, with source-target overrides for the top row preserved by the canonical pass mapping
- pass lane clusters should stay compact and table-centered: north/south clusters align to the table center X, east/west clusters align to the play-surface center Y
- pass lanes should maintain clearance from the current source hand, identity zones, and center metadata instead of relying on phase-specific offsets; trick stages are phase-exclusive and may reuse the same seat-local middle-lane region once passing is hidden
- north and south across lanes may receive only small seatward Y nudges while staying horizontally centered and keeping their existing order, spacing, and rotation
- east and west hand/status clusters should keep a small horizontal inset from the table edges, and the north hand should sit closer beneath the north label without changing north card size or fan width
- exchange rendering must keep every card in exactly one visible bucket: hand, pass lane transit, or pickup staging
- Dog lead transfer visuals should follow the engine-resolved recipient, not a UI-only guess
- Tichu, Grand Tichu, turn, and out badges should stay attached to each identity zone: east/west above the vertical label, north to the right of the label, and south to the left of the label
- pass lanes should keep their current group positions while rotating only the slot elements by destination mapping
- seat-local trick stages should borrow the same partner-lane anchor region used in exchange, then bind only slightly back toward the owning seat for readability
- side-seat inset changes should stay X-only; east and west remain vertically centered while moving farther off the frame edge when a precision nudge pass calls for it
- north tightening should only shorten the label-to-hand stack slightly; north label anchoring to the score stack stays unchanged
- east and west live trick cards may rotate at the card element only, while the trick-stage stack itself stays a straight vertical column
- trick-stage relaxation should be a small outward seat-axis nudge only, preserving the same seat-local anchor region and avoiding any global recentering
- the partner passing lane is the cluster anchor for every seat: north/south partner lanes sit on `playArea.centerX`, east/west partner lanes sit on `playArea.centerY`, partner-lane orientation is fixed per seat, and the two outer lanes derive from that anchor with symmetric post-rotation spacing
- pass-lane clusters behave as shared-edge units after rotation: north lanes share a top edge, south lanes share a bottom edge, east lanes share a right edge, and west lanes share a left edge while keeping the partner lane as the anchor
- east and west exchange lane stacks must derive their hand clearance and vertical stack spacing from canonical layout tokens so both side stacks sit farther off the hands, stay mirrored, and remain vertically centered in the side seat zones
- east and west side labels sit at the exact horizontal midpoint between the live side-label border span and the corresponding hand edge, while side Tichu-family and out-order markers form a separate badge row centered above the corresponding hand
- play-area inset shadow is editor-only so gameplay keeps a cleaner center surface
- the blurred center felt layer is editor-only; gameplay should not mount any duplicate glow layer there
- active response turns must always resolve through a legal play or a legal pass, never by pausing on optional Tichu alone
- only one live Tichu-family call may exist per team; a partner Grand Tichu or Tichu suppresses further same-team Tichu calls

## Overlay And Dialog Guidance

- dialogs must stay centered and internally scrollable when needed
- opening a menu or modal must not introduce page scrolling
- debug surfaces should show bounded values and concise metadata
- copyable values should use monospace fields with reliable full-value access
- backend runtime controls should live in one discoverable menu/dialog surface instead of being scattered across gameplay chrome; the current home is hamburger menu -> `Backend Settings`, which now exposes `local`, `server_heuristic`, and `lightgbm_model` decision modes plus fallback, URL, telemetry, and backend health
- debug mode is now the master control panel: it surfaces provider transparency, heuristic and shallow-lookahead signals, telemetry completeness, exchange visibility, backend/ML health, runtime backend controls, timeline inspection, and raw payload drawers from one snapshot-driven dashboard

## Related Surfaces

- table editor
- hotkeys dialog
- how-to-play dialog
- random-sources dialog
- score/history surfaces
- backend settings dialog

Prompt-driven UI behavior changes should be captured in [../prompts/ui.md](../prompts/ui.md) and linked to the governing GitHub issue before implementation is considered complete.

Update this document when layout rules or core UI interaction contracts change.
