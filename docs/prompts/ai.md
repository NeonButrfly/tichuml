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

### 2026-05-02 - Outcome reward telemetry and controlled aggression tuning for LightGBM training

- Prompt Signal: The latest combined ML and behavior-quality request required
  two linked changes: add true outcome and reward telemetry so LightGBM can
  learn what actions actually led to good results, and tune passing/Tichu/Grand
  Tichu behavior to generate stronger training data without making bots
  reckless.
- Interpreted Requirement: Issue
  [#59](https://github.com/NeonButrfly/tichuml/issues/59) now also tracks
  outcome telemetry v1 for trick, hand, and game attribution; persisted reward
  components and idempotent result finalization; validation reporting for
  outcome-learning readiness; and a centralized balanced aggression profile that
  mildly penalizes pass decisions when stronger legal plays exist while adding
  bounded, explainable bonuses for justified Tichu and Grand Tichu calls.
- Affected Systems: `infra/db/migrations/0007_outcome_reward_telemetry.sql`,
  `apps/server/src/services/telemetry-outcome-finalizer.ts`,
  `apps/server/src/services/telemetry-repository.ts`,
  `apps/sim-runner/src/self-play-batch.ts`, `packages/shared/src/outcomes.ts`,
  `packages/ai-heuristics/src/*`, `packages/telemetry/src/*`,
  `scripts/telemetry-finalize-results.ts`,
  `scripts/telemetry-validate-training-data.ts`, and telemetry/heuristic
  integration tests.
- Linked GitHub Issue: [#59](https://github.com/NeonButrfly/tichuml/issues/59)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-05-01 - Predictive Tichu and Grand Tichu call evaluator

- Prompt Signal: Follow-up telemetry after Tichu teacher tuning still showed
  143 regular Tichu calls in 100 games (1.43/game), zero Grand Tichu calls, and
  one consistency bug where `call_tichu` was selected despite
  `tichu_call_score=187`, `tichu_call_threshold=245`, and
  `tichu_call_reason=decline_below_threshold`.
- Interpreted Requirement: Issue
  [#57](https://github.com/NeonButrfly/tichuml/issues/57) tracks a
  deterministic human-style predictive evaluator for regular Tichu and Grand
  Tichu calls. Calls must estimate first-out realism, exit steps, control
  recovery, fragmentation, premium control, partner/opponent pressure, and score
  context; any `decline_*` evaluator result must make the corresponding call
  action non-competitive.
- Affected Systems: `packages/ai-heuristics/src/tichu-call-evaluator.ts`,
  `packages/ai-heuristics/src/TichuDecisionEngine.ts`,
  `packages/ai-heuristics/src/serverFastPath.ts`, `packages/telemetry`,
  `scripts/telemetry-sanity.ts`, and heuristic/server-fast-path integration
  tests.
- Linked GitHub Issue: [#57](https://github.com/NeonButrfly/tichuml/issues/57)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-05-01 - Strategy-improvement labels beyond heuristic imitation

- Prompt Signal: The current ML path already expands one decision into
  candidate-action rows, but the original label is only `1` when the heuristic
  chose that action. The repo must support honest observed outcomes and
  counterfactual rollout labels instead of pretending unchosen actions have
  observed values.
- Interpreted Requirement: Issue
  [#59](https://github.com/NeonButrfly/tichuml/issues/59) tracks a strategy
  improvement path where `observed_*` columns stay clearly tied to the logged
  continuation, rollout labels estimate candidate action value through forced
  first actions plus offline continuation, LightGBM training supports non-
  imitation objectives, and evaluation only credits a model when it beats the
  heuristic under mirrored, gated validation.
- Affected Systems: `ml/export_training_rows.py`, `ml/train_lightgbm.py`,
  `apps/sim-runner/src/ml-rollouts.ts`, `apps/sim-runner/src/evaluate.ts`,
  `apps/server/src/providers/lightgbm-provider.ts`, telemetry/ML docs,
  validation artifacts.
- Linked GitHub Issue: [#59](https://github.com/NeonButrfly/tichuml/issues/59)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-04-29 - Strategic Mahjong wish selection for heuristic providers

- Prompt Signal: Full-mode telemetry showed Mahjong plays with
  `availableWishRanks` present but no chosen `wishRank`, leaving no active wish
  afterward and producing poor training signal even though no-wish Mahjong is a
  supported rules variant.
- Interpreted Requirement: Issue
  [#56](https://github.com/NeonButrfly/tichuml/issues/56) tracks local and
  server heuristic behavior that normally selects a deterministic, strategic
  Mahjong wish when ranks are available, while preserving engine/UI support for
  no-wish Mahjong. Wish selection must use cheap pass-memory and Tichu/Grand
  Tichu pressure signals and record stable metadata for selected or skipped
  wishes.
- Affected Systems: `packages/ai-heuristics`,
  `apps/server/src/providers/heuristic-provider.ts`,
  `apps/sim-runner/src/self-play-batch.ts`, `packages/telemetry`,
  `scripts/telemetry-sanity.ts`, engine/heuristic/telemetry integration tests.
- Linked GitHub Issue: [#56](https://github.com/NeonButrfly/tichuml/issues/56)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-04-28 - Self-play CLI games must finish as single scored hands for bounded training runs

- Prompt Signal: The latest simulator blocker request required `npm run sim`
  smoke commands with `--max-decisions-per-game 300` to finish reliably,
  produce final summaries, and generate real persisted telemetry for long
  training batches instead of rolling through multi-hand match continuation.
- Interpreted Requirement: Issue
  [#52](https://github.com/NeonButrfly/tichuml/issues/52) now tracks bounded
  self-play semantics where each simulated CLI "game" completes after the first
  scored hand, emits `hand_completed` and `game_completed`, increments both
  `gamesPlayed` and `handsPlayed` once per completed hand, and keeps the
  simulator fast enough for strict smoke tests and long local data generation.
- Affected Systems: `apps/sim-runner/src/cli.ts`,
  `apps/sim-runner/src/self-play-batch.ts`,
  `tests/integration/sim-cli.test.ts`,
  `tests/integration/self-play-match-semantics.test.ts`,
  `tests/integration/straight-response.test.ts`,
  `tests/integration/wish-state.test.ts`.
- Linked GitHub Issue: [#52](https://github.com/NeonButrfly/tichuml/issues/52)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-04-26 - Self-play game-vs-hand semantics must stay match-scoped

- Superseded By: [#52](https://github.com/NeonButrfly/tichuml/issues/52) for
  bounded simulator-training runs as of 2026-04-28.
- Prompt Signal: The latest self-play semantics request required simulator
  "games" to continue across multiple dealt hands until the cumulative match
  score reaches the engine's `>=1000` completion target, instead of treating a
  single hand as a full completed game.
- Interpreted Requirement: Issue
  [#48](https://github.com/NeonButrfly/tichuml/issues/48) tracks match-scoped
  self-play semantics where one simulated game can contain multiple sequential
  hands, `gamesPlayed` increments only when the full match ends, `handsPlayed`
  increments once per dealt hand, hand ids advance as `hand-1`, `hand-2`, and
  later summaries/telemetry expose the cumulative final score plus
  `matchWinner` without starting any extra hand after `matchComplete=true`.
- Affected Systems: `apps/sim-runner/src/self-play-batch.ts`,
  `apps/sim-runner/src/sim-diagnostics.ts`,
  `tests/integration/self-play-match-semantics.test.ts`,
  `tests/integration/sim-diagnostics.test.ts`.
- Linked GitHub Issue: [#48](https://github.com/NeonButrfly/tichuml/issues/48)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

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

### 2026-04-23 - Server heuristic fast-path live policy with rich-path opt-in analysis

- Prompt Signal: The latest server heuristic prompt required restoring
  low-latency live backend play without removing intelligence, by splitting
  `server_heuristic` into a bounded fast path for live decisions and a richer
  optional analysis path for diagnostics.
- Interpreted Requirement: Issue [#46](https://github.com/NeonButrfly/tichuml/issues/46)
  tracks a new `server-fast-path` policy surface that keeps centralized tunable
  weights, bounded pass/trick candidate generation, lowest-winning and
  structure-preserving play preferences, bomb/Phoenix conservation, and legal
  fallback guarantees on the live path while moving rich explainability,
  full-state validation, and telemetry shaping off the gameplay critical path.
- Affected Systems: `packages/ai-heuristics/src/serverFastPath.ts`,
  `packages/ai-heuristics/src/index.ts`,
  `apps/server/src/providers/heuristic-provider.ts`,
  `apps/sim-runner/src/self-play-batch.ts`,
  `tests/integration/server-fast-path.test.ts`,
  `tests/integration/server-heuristic-contract.test.ts`.
- Linked GitHub Issue: [#46](https://github.com/NeonButrfly/tichuml/issues/46)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-04-30 - Tichu teacher selectivity and wish fulfillment telemetry

- Prompt Signal: A 1000-game full-mode telemetry sanity run showed roughly two regular Tichu calls per game and several false-positive required-wish violations on multi-card plays that contained the wished rank.
- Interpreted Requirement: Local and server heuristic teachers should call regular Tichu more selectively, keep Grand Tichu rare, emit stable Tichu score/risk metadata, and keep wish fulfillment telemetry aligned with actual combo contents rather than only single-card exact matches.
- Affected Systems: `packages/ai-heuristics/src/*`, `packages/telemetry/src/builders.ts`, `scripts/telemetry-sanity.ts`, telemetry and heuristic integration tests.
- Linked GitHub Issue: [#57](https://github.com/NeonButrfly/tichuml/issues/57)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.
