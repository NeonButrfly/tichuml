# Telemetry ML Readiness

Tracking issue: [#59](https://github.com/NeonButrfly/tichuml/issues/59)

Strict telemetry-readiness loop: [#78](https://github.com/NeonButrfly/tichuml/issues/78)

## Readiness summary

Telemetry is now strong enough to support:

- candidate-action imitation datasets
- observed hand and match outcome enrichment
- persisted reward attribution for outcome-based learning experiments
- offline counterfactual rollout jobs when full pre-action state was captured
- runtime LightGBM scoring diagnostics and fallback analysis
- strict JSON-safe LightGBM metadata exchange so evaluation cannot crash the
  backend on `NaN`-bearing validation metrics (issue
  [#82](https://github.com/NeonButrfly/tichuml/issues/82))
- bounded candidate-prefilter metadata for large online LightGBM trick-play
  requests so runtime latency caps are visible in telemetry

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

`ml:export` now treats outcomes honestly and exports a clean baseline slice by
default.

- observed outcome columns are named `observed_*`
- they represent the logged continuation only
- they may appear on every candidate row for context
- they are excluded from runtime feature manifests by default
- issue [#77](https://github.com/NeonButrfly/tichuml/issues/77) hardened
  chunked Parquet export so numeric columns stay stable even when early chunks
  are all-null, and `ml:train` now coerces numeric-looking feature columns read
  back from Parquet before LightGBM fitting
- baseline export focuses on clean chosen-decision rows for the requested
  scope, not merely raw telemetry row presence
- scoped validate-only export defaults to `server_heuristic` unless a provider
  is explicitly overridden, so mixed-policy DB windows are filtered or flagged
  instead of silently exported
- baseline export excludes `exploration_selected=true` rows unless
  `--include-exploration` is passed explicitly
- grouped train/validation/test split reporting is by `game_id`, never random
  decision-row splitting
- `validation_report.json` now records row counts, provider/phase/action
  distributions, reward quantiles, split counts, exploration counts, and the
  leakage-denylist result
- `feature_columns.json` must never include leakage fields such as
  `outcome_reward`, final score fields, winner fields, or completion
  timestamps

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

Use `validation_report.json` when deciding whether a run is LightGBM-ready.
That report is the hard gate for:

- grouped-by-game split confirmation
- exploration exclusion by default
- leakage-denylist pass/fail
- null and NaN feature counts
- reward distribution by chosen action type and exploration bucket
- provider-distribution truth for the full scope versus the exported provider
  slice
- invalid-decision and incomplete-match rejection
- concurrent-writer overlap warnings for the scoped run window

For DB-backed result attribution and training-readiness checks, use:

- `npm run telemetry:finalize-results`
- `npm run telemetry:validate-training-data`
- `npm run telemetry:validate-run -- --game-id-prefix <prefix>`
- `npm run telemetry:ready -- --games-per-batch <count> --max-attempts <n>`

The validator now reports coverage for `hand_result`, `game_result`, and
`outcome_reward`, reward min/avg/max, action and phase distributions, provider
mix, pass/Tichu/Grand Tichu rates, candidate-score stats by action, and
aggression-component counts.

System-owned control transitions in `pass_reveal`, `exchange_complete`, and
`round_scoring` now receive explicit neutral outcome attribution instead of
remaining null. Readiness therefore expects `reward_count === decisions` with no
phase/provider exceptions.

`telemetry:ready` is the destructive no-holes operator path for local
readiness verification. It clears the training tables for each attempt, runs a
scoped full-telemetry self-play batch, flushes and finalizes outcomes, runs
both global and scoped telemetry validation, checks `ml:export --validate-only`,
and repeats until the run is warning-free and coverage-complete or the max
attempt limit is exhausted. Each attempt writes machine-readable summaries for
finalization, training-data validation, scoped run validation, and the final
readiness gate into its run directory plus an outer attempt summary file.

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
