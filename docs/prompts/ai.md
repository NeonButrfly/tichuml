# AI Prompt Capture

Use this file to preserve AI and bot-behavior prompt intent and link it to GitHub work. GitHub issue state is authoritative; this file is not a parallel tracker.

## Entry Structure

- Date
- Prompt Signal
- Interpreted Requirement
- Affected Systems
- Linked GitHub Issue
- Milestone
- Status Source

## Entries

### 2026-04-10 - Bot partner-awareness regression guard

- Prompt Signal: The forward stabilization request explicitly called out bot and AI improvements and required a regression guard for partner-awareness rules.
- Interpreted Requirement: Bot decisions must continue to respect team-call occupancy, support opportunities, and Dragon gifting responsibilities instead of optimizing only seat-local value.
- Affected Systems: `packages/ai-heuristics/src/index.ts`, `apps/sim-runner/src/index.ts`, heuristics and headless simulation tests.
- Linked GitHub Issue: [#17](https://github.com/NeonButrfly/tichuml/issues/17)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Bot support heuristics

- Prompt Signal: The forward stabilization request called for bot and AI improvements beyond the current baseline.
- Interpreted Requirement: The deterministic bot should improve support-oriented pass selection, lead choice, and Dragon assignment while remaining legality-driven and explainable.
- Affected Systems: `packages/ai-heuristics/src/index.ts`, `apps/sim-runner/src/index.ts`, `tests/integration/heuristics-v1.test.ts`, `tests/integration/headless-ai-round.test.ts`.
- Linked GitHub Issue: [#23](https://github.com/NeonButrfly/tichuml/issues/23)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.
