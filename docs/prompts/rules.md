# Rules Prompt Capture

Use this file to preserve rule- and legality-focused prompt intent and link it to GitHub work. GitHub issue state is authoritative; this file is not a parallel tracker.

## Entry Structure

- Date
- Prompt Signal
- Interpreted Requirement
- Affected Systems
- Linked GitHub Issue
- Milestone
- Status Source

## Entries

### 2026-04-10 - Wish enforcement

- Prompt Signal: The forward stabilization request explicitly called out wish enforcement and required a regression guard that it must always be honored.
- Interpreted Requirement: If a legal move can satisfy a Mahjong wish, the active seat must be constrained to wish-fulfilling play actions, and fallback legality must only apply when no such move exists.
- Affected Systems: `packages/engine/src/engine.ts`, `packages/engine/src/combination.ts`, `packages/ai-heuristics/src/index.ts`, rule and UI-alignment tests.
- Linked GitHub Issue: [#15](https://github.com/NeonButrfly/tichuml/issues/15)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Trick resolution correctness

- Prompt Signal: The forward stabilization request explicitly called out trick resolution correctness as a regression guard.
- Interpreted Requirement: Trick completion, Dog lead transfer, Dragon assignment, and hand-end resolution must continue to flow from one authoritative engine path with no UI-side reinterpretation.
- Affected Systems: `packages/engine/src/engine.ts`, `packages/engine/src/types.ts`, replay and trick-resolution tests, debug surfaces that render resolution events.
- Linked GitHub Issue: [#16](https://github.com/NeonButrfly/tichuml/issues/16)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Tichu call logic

- Prompt Signal: The forward stabilization request explicitly called out Tichu call logic.
- Interpreted Requirement: Small Tichu eligibility windows and blocked-call reasons must remain rule-correct and consistently surfaced across engine, bot, and UI layers.
- Affected Systems: `packages/engine/src/engine.ts`, `packages/ai-heuristics/src/index.ts`, `apps/web/src/game-table-view-model.ts`, rule and action-availability tests.
- Linked GitHub Issue: [#22](https://github.com/NeonButrfly/tichuml/issues/22)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.
