# ML Strategy Improvement

Tracking issue: [#59](https://github.com/NeonButrfly/tichuml/issues/59)

## Why this exists

TichuML already had an end-to-end telemetry, export, training, inference, and
evaluation path, but it was imitation-first. The original LightGBM pipeline
learned `label=1` only when a logged candidate action matched the heuristic
provider's chosen action. That is useful for cloning the current policy, but it
is not enough for strategy improvement.

The repo now separates three different supervision signals:

- `imitation`:
  candidate row label is `1` only when the logged provider chose that action.
- `observed_outcome`:
  outcome columns describe what happened after the logged continuation. These
  are valuable context and weak learning targets, but they are not
  counterfactual values for unchosen actions.
- `rollout`:
  a candidate action is forced first, validated through the engine, and then
  continued offline. These labels are the main strategy-improvement signal.

## Current state

The repo is no longer imitation-only.

- Telemetry stores richer match lifecycle outcomes, decision metadata, and
  full-state replay context when full telemetry is enabled.
- `ml:export` streams decisions in chunks, expands one row per legal action,
  keeps the legacy imitation `label`, and adds clearly named `observed_*`
  outcome columns by default.
- `ml:rollouts` creates offline counterfactual labels and writes resumable JSONL
  results plus quality reports.
- `ml:train` supports `imitation_binary`, `observed_outcome_regression`,
  `rollout_regression`, and `rollout_ranker`.
- `ml:evaluate` supports heuristic sanity baselines, mirrored seating, provider
  comparison summaries, and a configurable improvement gate.

That makes the codebase strategy-improvement ready. It does not mean the
currently checked-in model is strategy-improved. The evaluation report under
`artifacts/ml/evaluation-report.json` is the authority for that.

## Commands

Export candidate-action rows with observed outcomes:

```powershell
npm run ml:export -- --database-url "$env:DATABASE_URL" --phase trick_play
```

Generate rollout labels:

```powershell
npm run ml:rollouts -- --database-url "$env:DATABASE_URL" --phase trick_play --provider local_heuristic --continuation-provider local --rollouts-per-action 4 --max-decisions 100
```

Train the legacy imitation model:

```powershell
npm run ml:train -- --input ml/data/action_rows.parquet --phase trick_play
```

Train against observed outcomes:

```powershell
npm run ml:train -- --input ml/data/action_rows.parquet --manifest-input artifacts/ml/export-manifest.json --objective observed_outcome_regression --phase trick_play
```

Train against rollout labels:

```powershell
npm run ml:train -- --input ml/data/action_rows.parquet --manifest-input artifacts/ml/export-manifest.json --rollout-input artifacts/ml/rollouts.jsonl --objective rollout_regression --phase trick_play
```

Evaluate a model against the heuristic baseline:

```powershell
npm run ml:evaluate -- --games 100 --ns-provider lightgbm_model --ew-provider server_heuristic --mirror-seats true --backend-url http://127.0.0.1:4310
```

## Data products

`ml:export` writes:

- `ml/data/action_rows.parquet` by default
- `ml/data/action_rows.schema.json`
- `ml/data/action_rows.quality.json`
- `ml/data/action_rows.quality.md`
- `ml/feature_schema.json`
- `artifacts/ml/export-manifest.json`

`ml:rollouts` writes:

- rollout result JSONL
- `artifacts/ml/rollout-jobs.jsonl`
- `artifacts/ml/rollout-quality.json`
- `artifacts/ml/rollout-quality.md`

`ml:train` writes:

- model text output
- model metadata JSON
- `artifacts/ml/training-report.json`
- `artifacts/ml/training-report.md`
- `artifacts/ml/feature-importance.csv`

`ml:evaluate` writes:

- `artifacts/ml/evaluation-report.json`
- `artifacts/ml/evaluation-report.md`
- `eval/results/latest_summary.json`

## How to interpret labels

`observed_*` columns are intentionally named to prevent misuse.

- `observed_actor_team_hand_delta` is the outcome of the logged continuation.
- It is copied onto every candidate row for that decision as context.
- It must not be described as the true value of each unchosen candidate action.

Rollout columns are different.

- `rollout_mean_actor_team_delta` is a counterfactual estimate for the specific
  candidate row.
- Training objectives that use rollout targets are the main path toward actual
  strategy improvement.

## Improvement gate

A model is only considered better when the evaluation gate passes.

The default gate checks:

- enough games were evaluated
- challenger win rate beats baseline
- average score delta is positive
- illegal actions do not increase
- fallbacks do not increase
- average latency stays within the configured limit

The current evaluation harness writes pass or fail details into
`artifacts/ml/evaluation-report.json`.

## Safe runtime usage

`lightgbm_model` still scores only legal actions and falls back safely.

- illegal or mismatched score vectors trigger fallback
- non-finite scores trigger fallback
- telemetry records model metadata, score summaries, selected score, runtime
  feature counts, and fallback reason

If a validation run shows large fallback counts or poor head-to-head results, do
not claim the model is ready. Treat the evaluation report as authoritative.

## Known limitations

- Offline rollout validation was smoke-tested on small bounded samples; large
  batches should still be treated as operational work and monitored through the
  rollout quality report.
- `ml:rollouts --input-export` currently expects JSONL when it is used as a
  subset filter.
- Full offline rollout reconstruction still depends on decisions that captured
  full pre-action `state_raw`.
- A bounded sample can prove that rollout-aware training code exists, but it
  cannot prove model quality. Use `ml:evaluate` with a sufficient game count for
  that.
