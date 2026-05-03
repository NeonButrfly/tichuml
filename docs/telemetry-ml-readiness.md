# Telemetry ML Readiness

Tracking issue: [#59](https://github.com/NeonButrfly/tichuml/issues/59)

## Readiness summary

Telemetry is now strong enough to support:

- candidate-action imitation datasets
- observed hand and match outcome enrichment
- persisted reward attribution for outcome-based learning experiments
- offline counterfactual rollout jobs when full pre-action state was captured
- runtime LightGBM scoring diagnostics and fallback analysis

This is not the same as saying every historical decision row is rollout-ready.
Compact minimal telemetry can still be insufficient for deterministic offline
continuation.

## Decision readiness

Decision telemetry now preserves or derives the fields needed for ML export and
model analysis:

- decision identity and provider context
- pre-action `state_raw` and `state_norm`
- actor-scoped `legal_actions`
- `chosen_action`
- legality and hash fields
- candidate explanations, scores, and features when present
- policy metadata and fallback metadata
- enough context for forced-action replay when full state is present

Important constraint:

- strategy-improvement rollouts require full pre-action `state_raw`
- minimal telemetry remains valid for runtime health and compact export, but it
  is not a guarantee of rollout reconstructability

## Event and match readiness

Telemetry lifecycle storage now records match outcome fields needed by export:

- `matches.final_team_0_score`
- `matches.final_team_1_score`
- `matches.winner_team`
- `matches.hands_played`
- `matches.failure_reason`

Self-play completion events also carry the metadata needed to derive hand and
match outcomes more directly, including final scores and winner team when
available. Outcome telemetry v1 now also adds decision-level attribution fields
for trick, hand, and game results plus:

- `actor_team`, `trick_id`, `trick_index`, `hand_index`, `game_index`
- `trick_winner_*`, `trick_points`, `actor_team_won_trick`
- hand and game score deltas / winner flags
- `hand_result`, `game_result`
- `outcome_reward`, `outcome_components`, `outcome_version`

## Export semantics

`ml:export` now treats outcomes honestly.

- observed outcome columns are named `observed_*`
- they represent the logged continuation only
- they may appear on every candidate row for context
- they are excluded from runtime feature manifests by default

This prevents the old conceptual mistake where unchosen actions appear to have
their own observed outcomes.

## Quality and manifest files

Every export writes machine-readable metadata:

- schema output
- feature schema
- export manifest
- quality JSON
- quality Markdown

Use the quality report first when checking a dataset. It shows:

- how many decisions were read and processed
- candidate row counts
- missing `state_raw` and `state_norm` counts
- chosen-action match rate
- outcome coverage
- fallback row counts
- phase, provider, and actor-seat distributions

For DB-backed result attribution and training-readiness checks, use:

- `npm run telemetry:finalize-results`
- `npm run telemetry:validate-training-data`

The validator now reports coverage for `hand_result`, `game_result`, and
`outcome_reward`, reward min/avg/max, action and phase distributions, provider
mix, pass/Tichu/Grand Tichu rates, candidate-score stats by action, and
aggression-component counts.

## Recommended capture mode

For serious strategy-improvement data generation:

- keep simulator telemetry non-blocking
- use full telemetry mode when generating rollout-ready training rows
- keep `strict_telemetry=false` for normal production-style runs
- replay any pending spillover with `npm run telemetry:replay`

## Validation evidence

The current implementation was validated with:

- a fresh full-telemetry local self-play sample into Postgres
- a bounded chunked export that produced observed outcome columns and quality
  reports
- live rollout smoke jobs against stored decisions
- LightGBM training on the exported sample
- mirrored evaluation report generation against the backend provider path

The latest repo-local machine-readable evidence lives under `artifacts/ml/`.

Additional 2026-05-02 repo-local validation for issue
[#59](https://github.com/NeonButrfly/tichuml/issues/59) covered:

- full workspace build success after outcome/aggression changes
- focused telemetry and heuristic regression tests
- 10-game local sim success with telemetry disabled
- 10-game local sim success with telemetry enabled, `strict_telemetry=false`,
  and an intentionally dead backend endpoint to confirm non-blocking fallback
- a local Postgres migration plus `telemetry:finalize-results` /
  `telemetry:validate-training-data` smoke pass on the existing local dataset

Current caveat:

- the local Postgres sample validated outcome-field persistence and reward
  attribution, but it did not yet represent a rich candidate-score training
  corpus; use a fresh full-telemetry sim dataset before claiming full
  behavior-cloning or ranking readiness from that specific local DB snapshot
