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

### 2026-05-03 - Shared continuation and decision contract across UI, selfplay, rollout, backend, and telemetry

- Prompt Signal: The repo had split-brain behavior around the shared engine: selfplay, UI, rollout, backend validation, decision request serialization, and telemetry adapters were each carrying partially duplicated actor/continuation contracts and next-hand carry behavior.
- Interpreted Requirement: Keep `packages/engine/src/engine.ts` authoritative for in-hand rules, extract one shared continuation contract from the selfplay-grade flow for actor selection, stop reasons, Dragon gift handling, null `activeSeat` recovery, and next-hand carry, then make UI, selfplay, rollout, backend validation, and telemetry normalize through that single contract without changing scoring semantics.
- Affected Systems: `packages/engine/src/continuation.ts`, `packages/engine/src/seat-identity.ts`, `packages/ai-heuristics/src/decision-contract.ts`, `apps/sim-runner/src/self-play-batch.ts`, `apps/web/src/App.tsx`, `apps/web/src/table-model.ts`, `apps/web/src/backend/decision-provider.ts`, `apps/server/src/providers/lightgbm-provider.ts`, `packages/telemetry/src/source-adapters.ts`, and continuation/contract integration tests.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-03 - Selfplay continuation across every non-terminal phase transition

- Prompt Signal: Short and low-count selfplay exports proved that games were silently stopping after valid non-terminal actions in `grand_tichu_window`, `pass_select`, `trick_play`, Dragon gift resolution, and round scoring or next-hand transitions.
- Interpreted Requirement: After every selfplay action, the simulator must use the returned state, recompute legal actions plus the next actor through phase-aware rules, continue until terminal match completion or an explicit stop reason, and emit stop-reason telemetry for every short or failed game instead of silently terminating.
- Affected Systems: `apps/sim-runner/src/self-play-batch.ts`, `apps/sim-runner/src/ml-rollouts.ts`, `apps/sim-runner/src/selfplay-validate-short-games.ts`, selfplay integration tests, telemetry and validation reporting.
- Linked GitHub Issue: [#60](https://github.com/NeonButrfly/tichuml/issues/60)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

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
