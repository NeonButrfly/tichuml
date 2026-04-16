# UI Prompt Capture

Use this file to preserve UI and UX prompt intent and link it to GitHub work. GitHub issue state is authoritative; this file is not a parallel tracker.

## Entry Structure

- Date
- Prompt Signal
- Interpreted Requirement
- Affected Systems
- Linked GitHub Issue
- Milestone
- Status Source

## Entries

### 2026-04-10 - Passing lanes layout

- Prompt Signal: The forward stabilization request explicitly called out passing lanes layout.
- Interpreted Requirement: Left, partner, and right pass lanes must remain directionally clear, readable, and stable across all seats and narrower viewports.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, layout and viewport tests.
- Linked GitHub Issue: [#19](https://github.com/NeonButrfly/tichuml/issues/19)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Trick fanning

- Prompt Signal: The forward stabilization request explicitly called out trick fanning.
- Interpreted Requirement: Seat-local trick displays should fan multi-card combinations clearly without crowding nearby overlays or obscuring card identity.
- Affected Systems: `apps/web/src/game-table-views.tsx`, `apps/web/src/table-layout.ts`, trick-display tests and screenshot verification.
- Linked GitHub Issue: [#20](https://github.com/NeonButrfly/tichuml/issues/20)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - UI clarity issues

- Prompt Signal: The forward stabilization request explicitly called out UI clarity issues.
- Interpreted Requirement: Rule-driven states such as active wishes should be visible and understandable from the live table UI without relying on code knowledge.
- Affected Systems: `apps/web/src/game-table-view-model.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/App.tsx`, view-model and component tests.
- Linked GitHub Issue: [#21](https://github.com/NeonButrfly/tichuml/issues/21)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Canonical layout JSON

- Prompt Signal: The table layout system must keep `layout.json` as the canonical artifact and make the runtime/editor reflect the corrected play surface without drift.
- Interpreted Requirement: The shipped table layout must live in one canonical JSON file, and runtime defaults plus editor load/save/reset behavior must use that same schema and anchor set without stale XML or hard-coded default divergence.
- Affected Systems: `apps/web/src/layout.json`, `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/App.tsx`, layout integration tests.
- Linked GitHub Issue: [#27](https://github.com/NeonButrfly/tichuml/issues/27)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Shared play-area anchoring and exchange origin clarity

- Prompt Signal: The normal table UI must feel perfectly centered and symmetric under one shared coordinate system, and exchange-complete received cards must remain visible in directional passing lanes until pickup.
- Interpreted Requirement: Runtime seat regions, overlays, center messaging, editor regions, and pass lanes must resolve `layout.json` through one board-space reference so south turn state, east/west centering, west safe inset, north spacing, and editor/runtime correspondence stay aligned; exchange-complete received cards must render in the receiver's left/partner/right lanes instead of collapsing into a generic pickup pile.
- Affected Systems: `apps/web/src/App.tsx`, `apps/web/src/game-table-views.tsx`, `apps/web/src/table-layout.ts`, `apps/web/src/styles.css`, table editor geometry, exchange/layout integration tests.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - East and west side-seat anchoring

- Prompt Signal: The east and west side-seat area still showed detached labels and a broken west-hand composition even after manual `layout.json` edits.
- Interpreted Requirement: Runtime side-seat placement must stop treating east/west labels as global board-edge overlays; the side label must be attached inside the same seat container as the side hand, while side-label anchor math only applies edge-safe clamping after reading the layout data and both side seat regions continue centering on the same hand anchors so west does not pick up a stale left-shift.
- Affected Systems: `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `apps/web/src/table-layout.ts`, side-seat layout integration tests, prompt-linked validation for the normal table runtime/editor layout.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Canonical table geometry rewrite

- Prompt Signal: The controlled UI layout rewrite requested a checkpoint commit/tag first, then a canonical rectangular table geometry with N/E/S/W seat anchors, hand-attached labels, directional exchange lanes, a clean center area, separated south action row, and runtime/editor alignment without changing gameplay, phase, button, Tichu, passing, pickup, wish, trick, score, bot, card-art, or rule logic.
- Interpreted Requirement: Runtime and editor layout must derive from one board-space play surface. Each visual seat must expose a canonical seat anchor (`northSeat`, `eastSeat`, `southSeat`, `westSeat`) whose hand bounds determine the seat label and exchange lanes; east and west labels must resolve directly from side hand bounds instead of screen-edge clamps or fallback layout anchors.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/normal-viewport-layout.test.ts`, live normal-table/editor verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Post-rewrite structural correction

- Prompt Signal: The follow-up layout prompt identified remaining structural issues after the broader rewrite: west anchoring, north/south label polarity, action row spacing, pass-lane alignment, arc-style play areas, and detached `T` / `GT` / turn / out badges.
- Interpreted Requirement: Keep the existing canonical geometry system and correct only seat-derived positions: west must mirror east from the same side-seat model, north labels sit above the hand, south labels sit below the hand, action controls sit lower than the south identity zone, trick/pickup stage cards use straight rows or columns, and badges attach to each player's identity zone according to seat direction.
- Affected Systems: `apps/web/src/layout.json`, `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, layout/staging integration tests, normal-table browser verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Spacing and collision-avoidance polish

- Prompt Signal: The spacing polish prompt narrowed the remaining work to breathing room, overlap prevention, phase-stable separation, and directional pass-lane alignment without changing gameplay, buttons, phases, rules, bots, card art, colors, or the broader table design.
- Interpreted Requirement: Keep the existing anchor system and normalize shared spacing tokens so pass lanes, hands, labels, badges, stage cards, central metadata, and the action row keep clearance across supported resolutions. South lanes must render as a bottom-aligned `< ^ >` row above the south hand, north as a top-aligned `< v >` row below the north hand, east as a right-aligned `^ < v` column left of the east hand, and west as a left-aligned `^ > v` column right of the west hand.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `tests/integration/normal-viewport-layout.test.ts`, normal-table browser collision verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Final alignment and orientation correction

- Prompt Signal: The final correction prompt required score/label/hand stack enforcement, east/west play-area centering, compact pass-lane clusters, seat-relative stage anchoring, horizontal east/west hands, strict seat-facing card orientation, and collision prevention without gameplay or button changes.
- Interpreted Requirement: Keep the canonical layout system and make the rules explicit: score stays top-center, north label stacks below score before the north hand, east/west hands share the play-surface centerY and render as horizontal rows, pass lanes use compact table-centered clusters outside the current source hand, and hand/stage cards face up/down/left/right according to seat.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/normal-viewport-layout.test.ts`, normal-table browser collision and orientation smoke checks.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Side-seat card orientation regression

- Prompt Signal: The east/west hand regression prompt identified CSS/render rotation as the root cause of broken side-seat layout boxes, spacing, clipping, and fan behavior.
- Interpreted Requirement: Normal-table cards must not use visual rotation transforms. Seat orientation must come from the canonical play-area coordinate contract, card ordering, fan axis, and edge alignment: north/south fan on X, east/west fan downward on Y with east visually reversed and right-aligned, west normal order and left-aligned.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/normal-viewport-layout.test.ts`, `tests/integration/trick-ui-cleanup.test.ts`, normal-table browser orientation smoke checks.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Localized hand-and-slot orientation correction

- Prompt Signal: The follow-up prompt froze the current table geometry and requested only localized fixes for east/west hand card orientation, north hand card sizing, pass-slot rotation, played-card seat binding, and west status-cluster ordering.
- Interpreted Requirement: Keep the existing layout baseline untouched outside the named targets. Rotate only west/east card elements, scale only north hand card elements while slightly tightening the north fan, rotate only pass-slot elements in place by destination, move only trick-stage render anchors slightly toward their owning seats, and reorder only the west OUT badge to sit to the right of the west T/GT badge.
- Affected Systems: `apps/web/src/styles.css`, `apps/web/src/game-table-views.tsx`, `apps/web/src/table-layout.ts`, targeted layout validation and browser smoke checks.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Visible pass-slot rotation and side-edge/north alignment correction

- Prompt Signal: The latest correction prompt kept the current table baseline frozen and narrowed the remaining work to visible pass-slot rotation, south duplicate-slot cleanup, east/west edge inset, north vertical alignment, and north-lane follow.
- Interpreted Requirement: Keep lane groups, slot order, seat labels, score, center text, buttons, south hand, and global geometry fixed. Rotate the visible pass-slot surfaces instead of only the slot wrapper, remove the apparent extra south-left slot artifact without changing the valid south lane set, inset east/west hand-plus-status clusters slightly inward on X only, and move the north hand upward on Y with the north lane cluster maintaining the tighter relationship.
- Affected Systems: `apps/web/src/styles.css`, `apps/web/src/table-layout.ts`, `tests/integration/normal-viewport-layout.test.ts`, browser exchange-view verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Phase-aware pass-lane and trick-anchor nudges

- Prompt Signal: The phase-aware nudge prompt froze the broader table geometry and asked only for north/south across-lane nudges, a slightly deeper east/west side inset, and played-card anchors that reuse the same seat-local region as pass lanes instead of reserving cross-phase clearance.
- Interpreted Requirement: Keep score, center text, buttons, hands, labels, status mapping, and the global layout algorithm fixed. Apply only small seat-axis nudges: lift the north pass-across cluster slightly, drop the south pass-across cluster slightly only within its current row, move east/west side-seat clusters slightly inward on X, and let trick-stage anchors derive from the same middle pass-lane anchor region because pass lanes are hidden during play.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `tests/integration/normal-viewport-layout.test.ts`, `tests/integration/trick-ui-cleanup.test.ts`, normal-table exchange/trick browser verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Precision inset, north tightening, and trick-orientation correction

- Prompt Signal: The latest prompt froze the broader table layout and requested only a precision nudge pass: stronger east/west inset, a slightly higher north hand, element-level center pass-slot orientation, slightly relaxed trick anchors, and corrected east/west played-card orientation while keeping the vertical trick stacks intact.
- Interpreted Requirement: Keep score, center text, buttons, south hand, hand card sizing, hand fan spacing, and the broader layout algorithm fixed. Increase only the side-seat X inset, tighten only the north hand Y position beneath the existing score/label stack, keep pass-lane groups fixed while rotating the visible slot elements instead of the parent lane container, relax trick-stage render anchors slightly away from their seats for readability, and rotate only east/west trick card elements so west faces left and east faces right.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/normal-viewport-layout.test.ts`, `tests/integration/trick-ui-cleanup.test.ts`, targeted exchange/trick validation.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Partner-lane anchor correction

- Prompt Signal: The latest prompt narrowed the work to the center or partner passing lane, requiring it to act as the true anchor reference for each seat’s lane cluster instead of merely being the middle lane by array order.
- Interpreted Requirement: Keep the existing lane system, hand sizing, card orientation, and general geometry intact. Compute the partner lane first from the canonical play-surface axis, enforce the seat-specific orientation there, then derive the outer lanes symmetrically from that anchor using post-rotation visual bounds and a small minimum gap so north and south clusters center on `playArea.centerX` and east and west clusters center on `playArea.centerY`.
- Affected Systems: `apps/web/src/table-layout.ts`, `tests/integration/normal-viewport-layout.test.ts`, targeted pass-lane validation.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Side-seat label midpoint and badge-row correction

- Prompt Signal: The latest UI prompt narrowed the work to east and west identity geometry, separating side labels from side badge rows and requiring midpoint rail labels plus hand-centered T/GT/out markers.
- Interpreted Requirement: Keep lane geometry, hand sizing, card orientation, and the broader layout fixed. Compute east and west labels at the horizontal midpoint between the live side-label border span and the corresponding hand bounds while keeping label `centerY` aligned to the hand, and render those side labels in board-overlay space instead of seat-local space. Center the side T/GT/out badge row above each hand with a fixed hand-to-badge gap instead of anchoring those markers to the vertical side label.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `tests/integration/normal-viewport-layout.test.ts`, targeted side-seat identity validation.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.
