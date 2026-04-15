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
