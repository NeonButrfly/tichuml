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

### 2026-04-17 - Legacy heuristic engine port and deterministic policy upgrade

- Prompt Signal: The latest AI upgrade request required porting the legacy heuristic engine behavior into the current repo, centralizing scoring, and upgrading lead/follow, urgency, passing, wish, bomb, Dragon, and Tichu decision quality without regressions.
- Interpreted Requirement: `heuristics-v1` must become a stronger deterministic production policy with explicit context-building, unified scoring, phase-specific lead/follow logic, partner-aware urgency overrides, structure-preserving pass selection, safer Dragon gifting, and lightweight explanation tags while staying fully compatible with the current engine and headless flow.
- Affected Systems: `packages/ai-heuristics/src/*`, `tests/integration/heuristics-v1.test.ts`, `tests/integration/headless-ai-round.test.ts`.
- Linked GitHub Issue: [#23](https://github.com/NeonButrfly/tichuml/issues/23)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-18 - Second-pass tactical local heuristic upgrade

- Prompt Signal: The follow-up AI upgrade request required a materially stronger local-only tactical bot with shallow lookahead, better hand decomposition, stronger endgame and tempo reasoning, better partnership tactics, and stronger pass-card evaluation beyond immediate flat scoring.
- Interpreted Requirement: `heuristics-v1` must add deterministic tactical deepening for the best play candidates, explicitly reward cleaner one-card finish lines, preserve structure more intentionally, detect fragile partner control before yielding, and compare urgent stop / tempo / support lines using future hand quality and team outcome rather than immediate cheapness alone.
- Affected Systems: `packages/ai-heuristics/src/*`, `tests/integration/heuristics-v1.test.ts`, `tests/integration/headless-ai-round.test.ts`.
- Linked GitHub Issue: [#23](https://github.com/NeonButrfly/tichuml/issues/23)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-19 - Shared tactical feature layer for local/server heuristic parity

- Prompt Signal: The latest AI architecture request required a shared tactical feature-analysis layer that both local and server heuristic providers use, with stable typed snapshots that can later feed LightGBM export/inference and the master control panel.
- Interpreted Requirement: `heuristics-v1` must compute one reusable tactical feature snapshot per acting seat and per candidate action, use those features in both local and server-backed heuristic scoring, surface them in policy explanations for debug/dashboard visibility, and avoid duplicate local/server interpretations of the same game state.
- Affected Systems: `packages/ai-heuristics/src/*`, `apps/server/src/providers/heuristic-provider.ts`, `apps/web/src/App.tsx`, `tests/integration/heuristics-v1.test.ts`, `tests/integration/headless-ai-round.test.ts`.
- Linked GitHub Issue: [#23](https://github.com/NeonButrfly/tichuml/issues/23)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-04-19 - Self-play training-data pipeline and LightGBM bootstrap

- Prompt Signal: The latest ML pipeline request required a complete self-play batch runner, exchange-safe decision/event recording, action-row export, shared feature building for training and inference, and simple commands to simulate, export, and train.
- Interpreted Requirement: Milestone `#31` must produce an end-to-end data engine where deterministic self-play writes raw telemetry into Postgres, exchange/pass phases remain recorded, action-row exports explode one decision into scored legal-action candidates using the shared tactical snapshot schema, and the LightGBM training/inference path reuses that same feature definition instead of rebuilding features separately.
- Affected Systems: `apps/sim-runner/src/*`, `apps/server/src/providers/*.ts`, `apps/server/src/ml/lightgbm-scorer.ts`, `ml/*`, `package.json`, `README.md`.
- Linked GitHub Issue: [#31](https://github.com/NeonButrfly/tichuml/issues/31)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.
