# Gameplay Prompt Capture

Use this file to preserve gameplay-facing prompt intent and link it to GitHub work. GitHub issue state is authoritative; this file is not a parallel tracker.

## Entry Structure

- Date
- Prompt Signal
- Interpreted Requirement
- Affected Systems
- Linked GitHub Issue
- Milestone
- Status Source

## Entries

### 2026-05-01 - Live Grand Tichu continuation and full-hand executor integrity

- Prompt Signal: The live normal UI must stop appearing to freeze at East during `grand_tichu_window`, keep the UI actor aligned with the engine actor that actually has legal GT actions, continue automatically through GT/deal/exchange/trick/scoring/next-hand startup, and never leave gameplay hanging on stale automated provider work.
- Interpreted Requirement: The live gameplay executor must schedule exactly one automated action per actor/state, reject stale async provider results, clear thinking/pending state on success or failure, and preserve full gameplay continuation across GT, exchange, pickup, trick play, Dragon, scoring, and next-hand startup without adding a manual rescue button.
- Affected Systems: `apps/web/src/App.tsx`, `apps/web/src/table-model.ts`, `packages/engine/src/engine.ts`, live gameplay integration tests, UI deadlock diagnostics.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Exchange and passing state integrity

- Prompt Signal: The forward stabilization request called for regression guards around exchange and passing state integrity.
- Interpreted Requirement: Passing, in-transit, pickup, and hand ownership must stay unambiguous and visible through the full exchange flow.
- Affected Systems: `packages/engine/src/engine.ts`, `apps/web/src/table-model.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/table-layout.ts`, exchange integration tests.
- Linked GitHub Issue: [#18](https://github.com/NeonButrfly/tichuml/issues/18)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Small Tichu call logic

- Prompt Signal: The forward stabilization request explicitly called out Tichu call logic.
- Interpreted Requirement: Small Tichu eligibility, same-team call-slot protection, and call explanations must stay aligned across engine, bot, and UI.
- Affected Systems: `packages/engine/src/engine.ts`, `packages/ai-heuristics/src/index.ts`, `apps/web/src/game-table-view-model.ts`, `apps/web/src/App.tsx`, related tests.
- Linked GitHub Issue: [#22](https://github.com/NeonButrfly/tichuml/issues/22)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.
