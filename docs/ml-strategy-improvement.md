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
  defaults to the canonical `server_heuristic` provider slice, keeps the legacy
  imitation `label`, and adds clearly named `observed_*` outcome columns by
  default.
- `ml:rollouts` creates offline counterfactual labels and writes resumable JSONL
  results plus quality reports.
- `ml:train` supports `imitation_binary`, `observed_outcome_regression`,
  `rollout_regression`, and `rollout_ranker`.
- `ml:train` now defaults to `observed_outcome_regression` with the
  runtime-safe `runtime_raw` feature profile, so the checked-in
  `lightgbm_model` can score trick-play requests without building the older
  shared tactical analyzer path.
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

When no provider override is supplied, `ml:export` now defaults to
`server_heuristic` so the generated dataset stays policy-consistent.

Validate scoped current-run export compatibility without writing a full dataset:

```powershell
npm run ml:export -- --validate-only --run-id <run_id> --game-id-prefix <game_id_prefix> --output-dir training-runs/<run_id>/ml
```

Scoped validation now defaults to `server_heuristic` when a run-specific scope
is supplied and no provider override is passed. The validation JSON also
reports full scoped provider distribution, excluded mixed-policy rows,
concurrent-writer overlap, fallback counts, invalid decision counts, bomb
counts, and whether the scoped dataset is ML-safe for export.

Write a scoped LightGBM-ready export bundle after a training run:

```powershell
npm run ml:export -- --run-id <run_id> --game-id-prefix <game_id_prefix> --output-dir training-runs/<run_id>/ml
```

Generate rollout labels:

```powershell
npm run ml:rollouts -- --database-url "$env:DATABASE_URL" --phase trick_play --provider local_heuristic --continuation-provider local --rollouts-per-action 4 --max-decisions 100
```

Issue [#95](https://github.com/NeonButrfly/tichuml/issues/95) tightened
timeout handling for `ml:rollouts`. Transient
`rollout_sample_timeout_<n>ms` failures are now retried with
`--sample-timeout-retries <count>` before the worker gives up on that sample,
and exhausted timeout rows are written to a replayable sidecar instead of being
accepted as final rollout labels.

Train the default runtime-safe model:

```powershell
npm run ml:train -- --input ml/data/action_rows.parquet --phase trick_play
```

That default command now trains `observed_outcome_regression` with the
`runtime_raw` feature profile and writes metadata that the backend uses to skip
the expensive shared tactical analyzer for trick-play inference.
If the backend is already running, restart it after training so the
`lightgbm_model` provider reloads the new model metadata before evaluation or
live inference.

Train against observed outcomes:

```powershell
npm run ml:train -- --input ml/data/action_rows.parquet --manifest-input artifacts/ml/export-manifest.json --objective observed_outcome_regression --phase trick_play
```

Train the older richer imitation path explicitly:

```powershell
npm run ml:train -- --input ml/data/action_rows.parquet --manifest-input artifacts/ml/export-manifest.json --objective imitation_binary --feature-profile full --phase trick_play
```

Train against rollout labels:

```powershell
npm run ml:train -- --input ml/data/action_rows.parquet --manifest-input artifacts/ml/export-manifest.json --rollout-input artifacts/ml/rollouts.jsonl --objective rollout_regression --phase trick_play
```

Evaluate a model against the heuristic baseline:

```powershell
npm run ml:evaluate -- --games 100 --ns-provider lightgbm_model --ew-provider server_heuristic --mirror-seats true --backend-url http://127.0.0.1:4310
```

Run the scoped post-readiness loop end to end:

```powershell
npm run ml:bootstrap -- --run-id <run_id> --game-id-prefix <game_id_prefix> --output-dir training-runs/<run_id>/ml --provider server_heuristic --backend-url http://127.0.0.1:4310 --evaluate-games 100
```

`ml:bootstrap` runs scoped `ml:export`, trains against `outcome_reward`, runs
mirrored `ml:evaluate`, and exits non-zero if the evaluation gate does not
pass. For a short host-side smoke, pass `--evaluate-min-games-for-gate <n>` to
keep the gate threshold aligned with the smaller evaluation sample:

```powershell
npm run ml:bootstrap -- --run-id <run_id> --game-id-prefix <game_id_prefix> --output-dir training-runs/<run_id>/ml --provider server_heuristic --backend-url http://127.0.0.1:4310 --evaluate-games 3 --evaluate-min-games-for-gate 3
```

Diagnose a completed observed-outcome training run:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/run-python.ts scripts/outcome_reward_diagnostics.py --run-root training-runs/<run_id>
```

The diagnostic writes `diagnostics/outcome_reward_diagnostics.md` and
`diagnostics/outcome_reward_diagnostics.json` under the run root. It also
recomputes validation metrics from the saved model artifact so metric drift is
visible when stored metadata is wrong.

Build a live-gameplay rollout-training candidate without a new self-play batch:

```powershell
npm run ml:live-bootstrap -- --output-dir training-runs/live-gameplay-001/ml --allow-mixed-providers --rollout-max-decisions 250 --rollouts-per-action 2 --objective rollout_regression
```

`ml:live-bootstrap` exports `source=gameplay` trick-play rows as JSONL, keeps
mixed live providers only when you opt in with `--allow-mixed-providers`, runs
offline rollout relabeling against that export selection, and trains a
rollout-regression candidate model bundle into the requested output directory
by default, unless you explicitly override `--objective`. It
then starts a temporary backend pinned to that candidate model and runs the
normal mirrored `ml:evaluate` improvement gate against it. The command still
does not auto-promote or repoint the live backend model for you; it only tells
you whether the newly trained live-data candidate cleared the gate.

The bootstrap launcher now also treats candidate evaluation integrity as part
of the gate: it fails fast if the run-local model artifacts are missing, if the
temporary candidate backend port is already occupied, or if the evaluation
report says a different model file was evaluated. That prevents a stale backend
or missing candidate bundle from being mistaken for a successful new run.

## Data products

`ml:export` writes:

- `ml/data/action_rows.parquet` by default
- `ml/data/action_rows.schema.json`
- `ml/data/action_rows.quality.json`
- `ml/data/action_rows.quality.md`
- `ml/feature_schema.json`
- `artifacts/ml/export-manifest.json`

When `--output-dir training-runs/<run_id>/ml` is supplied, `ml:export` also
scopes the source rows to the requested run and writes a self-contained export
bundle such as:

- `training-runs/<run_id>/ml/train.parquet` or `train.csv.gz`
- `training-runs/<run_id>/ml/dataset_metadata.json`
- `training-runs/<run_id>/ml/feature_schema.json`
- `training-runs/<run_id>/ml/feature_columns.json`
- `training-runs/<run_id>/ml/label_columns.json`

For live gameplay candidate work, the same output-dir mode now also supports a
`--source gameplay` slice and JSONL export for rollout selection. Mixed live
providers remain opt-in through `--allow-mixed-providers`; the default export
behavior still prefers a single canonical provider slice.

`--validate-only` uses the same scoped filters and LightGBM shape checks, but
it does not emit the full dataset. Its single JSON payload is intended to be
machine-parseable and deterministic under the same explicit DB/provider scope.

`ml:rollouts` writes:

- rollout result JSONL
- `artifacts/ml/rollout-jobs.jsonl`
- `artifacts/ml/rollout-retryable-failures.jsonl`
- `artifacts/ml/rollout-quality.json`
- `artifacts/ml/rollout-quality.md`

`ml:train` writes:

- model text output
- model metadata JSON
- `artifacts/ml/training-report.json`
- `artifacts/ml/training-report.md`
- `artifacts/ml/feature-importance.csv`
- training metadata including `feature_profile`, `phase`, `feature_names`,
  target distribution, baseline comparisons, model-vs-baseline improvement,
  and a Spearman interpretation band
- `rollout_ranker` reports now include simple ranker baselines such as
  `action_rank_descending`, grouped action-type mean target, and grouped
  seat/action-type mean target so failed runs can be compared against trivial
  heuristics before launching another large loop

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

For a finished rollout-ranker run, use:

- `scripts/rollout_ranker_postmortem.py --run-root <training-run-root>`

That script writes:

- `diagnostics/rollout_ranker_postmortem.json`
- `diagnostics/rollout_ranker_postmortem.md`

and summarizes validation metrics, internal baselines, evaluation fallback
contamination, and the highest-regret decision groups from the validation split.

## Safe runtime usage

`lightgbm_model` still scores only legal actions and falls back safely.

- illegal or mismatched score vectors trigger fallback
- non-finite scores trigger fallback
- large trick-play requests are prefiltered through the bounded fast-path
  candidate generator before full LightGBM feature building, and runtime
  metadata records when the cap was applied
- runtime-safe `runtime_raw` models advertise their feature profile through
  model metadata, and backend inference now skips shared tactical feature
  construction when that profile is active
- models trained for a different phase now delegate intentionally to
  `server_heuristic` instead of timing out and being counted as transport
  fallbacks
- issue [#82](https://github.com/NeonButrfly/tichuml/issues/82) hardened
  training metadata and inference responses to emit strict JSON, and the Node
  scorer now treats malformed protocol output as a recoverable fallback path
  instead of letting evaluation crash the backend
- telemetry records model metadata, score summaries, selected score, runtime
  feature counts, and fallback reason
- eligible `rollout_ranker` `runtime_raw` trick-play requests can now do a
  bounded live rerank after raw LightGBM scoring, where the backend scores all
  legal actions, simulates the top `K` candidates forward with tiny
  backend-heuristic continuation rollouts, and then chooses the best projected
  team outcome instead of blindly trusting the top raw score

If a validation run shows large fallback counts or poor head-to-head results, do
not claim the model is ready. Treat the evaluation report as authoritative.

## Known limitations

- Offline rollout validation was smoke-tested on small bounded samples; large
  batches should still be treated as operational work and monitored through the
  rollout quality report.
- Timeout-driven rows in `artifacts/ml/rollout-retryable-failures.jsonl` are
  intentionally incomplete and should be replayed on resume instead of being
  treated as final dataset rows.
- `ml:rollouts --input-export` currently expects JSONL when it is used as a
  subset filter.
- Full offline rollout reconstruction still depends on decisions that captured
  full pre-action `state_raw`.
- A bounded sample can prove that rollout-aware training code exists, but it
  cannot prove model quality. Use `ml:evaluate` with a sufficient game count for
  that.
