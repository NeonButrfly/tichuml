# Strategy Improvement Summary

Issue [#59](https://github.com/NeonButrfly/tichuml/issues/59) is now implemented
through the telemetry, export, rollout, training, runtime, and evaluation
surfaces.

## Current Classification

- Previous state: imitation-only
- Current state: rollout and counterfactual strategy-ready
- Important caveat: the currently checked-in LightGBM model is not yet
  strategy-improvement validated and fails the new evaluation gate

## What is validated

- `ml:export` works on live Postgres telemetry with chunked reads, candidate-row
  expansion, default `observed_*` outcome columns, schema output, manifest
  output, and quality reports
- `ml:train` still works in backward-compatible imitation mode on the exported
  sample
- `ml:rollouts` works on stored decisions and writes counterfactual JSONL rows
- `ml:evaluate` writes machine-readable reports and a mirrored improvement gate
- LightGBM runtime scoring now records richer metadata and falls back safely on
  invalid score outputs

## Validation evidence

- Export sample:
  `artifacts/ml/validation-action-rows.parquet`
- Export quality:
  `artifacts/ml/validation-action-rows.quality.json`
- Export manifest:
  `artifacts/ml/validation-export-manifest.json`
- Imitation training report:
  `artifacts/ml/training-report.json`
- Rollout samples:
  `artifacts/ml/validation-rollouts.jsonl`
  `artifacts/ml/validation-rollouts-multi.jsonl`
- Evaluation report:
  `artifacts/ml/evaluation-report.json`

## Key findings

- Observed outcomes are now explicit and honestly named. Unchosen legal actions
  are no longer implicitly treated as if they had their own observed values.
- The codebase now contains a real rollout-label path rather than a second
  imitation-only pipeline.
- The current checked-in LightGBM runtime model still underperforms the
  heuristic baseline and shows heavy fallback usage in the bounded evaluation
  run. In the latest one-game smoke comparison it lost 0-1 with `52`
  fallbacks versus `2` in the heuristic sanity baseline. The new gate correctly
  marks that as a fail.

## Remaining gaps

- Run rollout-target training on an export slice that overlaps the rollout
  sample and preserve the resulting regression or ranking report.
- Train and evaluate a new promotion candidate until `artifacts/ml/evaluation-report.json`
  shows a passing gate.
- Reduce the friction of bounded validation by adding export filters for recent
  or explicit decision IDs.
