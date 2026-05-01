# Pipeline Audit

Date: 2026-05-01
Tracker: Issue [#59](https://github.com/NeonButrfly/tichuml/issues/59)
Milestone: [6.5 - Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
Audit scope: pre-change repo audit for telemetry, ML export, training, runtime provider, and evaluation readiness

## Summary

The repo already has a real telemetry-backed ML path, but it is still imitation-first.

- Telemetry decisions are rich enough to support candidate-action expansion and some offline joins.
- Events and matches do not yet materialize hand and match outcomes strongly enough for exporter defaults or robust rollout workflows.
- `ml/export_training_rows.py` expands candidate rows, but it loads all queried decisions into memory, emits no observed outcome columns, no rollout labels, and no manifest or quality report.
- `ml/train_lightgbm.py` trains a binary imitation classifier only.
- `lightgbm_model` runtime inference is wired and legal-action scoped, but metadata and score-safety checks are still shallow.
- `ml:evaluate` compares providers, but it does not yet enforce an improvement gate.

Current readiness verdict before implementation:

- Telemetry: partially ML-ready
- Export: imitation-ready only
- Training: imitation-only
- Rollouts: missing
- Runtime: usable but metadata-limited
- Evaluation: baseline comparison only
- Overall: not yet strategy-improvement ready

## Discovery Notes

- Snapshot commit was taken before local edits:
  `69e0b6d chore: snapshot before telemetry/controller changes`
- Canonical issue created for this work:
  `#59 Refactor telemetry and LightGBM pipeline for strategy-improvement training`
- Related existing issues:
  `#31`, `#35`, `#51`
- Live database schema probe was attempted through repo Python and `DATABASE_URL` from local env, but the local credentials failed against `localhost:5432`. This audit therefore treats migrations plus repository insert/select code as the authoritative schema source for current stored fields.

## Telemetry Audit

### Decisions

Current persisted decision fields, from migrations plus `apps/server/src/services/telemetry-repository.ts`:

- `id`
- `match_id`
- `ts`
- `game_id`
- `hand_id`
- `phase`
- `actor_seat`
- `decision_index`
- `schema_version`
- `engine_version`
- `sim_version`
- `requested_provider`
- `provider_used`
- `fallback_used`
- `policy_name`
- `policy_source`
- `worker_id`
- `state_raw`
- `state_norm`
- `legal_actions`
- `chosen_action`
- `explanation`
- `candidate_scores`
- `state_features`
- `metadata`
- `antipattern_tags`
- `chosen_action_type`
- `legal_action_count`
- `chosen_action_is_legal`
- `has_explanation`
- `has_candidate_scores`
- `has_state_features`
- `explanation_quality_level`
- `has_wish`
- `wish_rank`
- `can_pass`
- `state_hash`
- `legal_actions_hash`
- `chosen_action_hash`
- `created_at`

Audit answers:

- Pre-action states captured: yes, in `state_raw` and sometimes `state_norm`
- Legal actions captured: yes
- Chosen actions captured: yes
- Candidate scores/features captured: yes, via `candidate_scores`, `state_features`, `explanation`, and some metadata payloads
- Full hands captured in `state_raw`: yes in full-mode/full-state paths, no in compact minimal telemetry
- Normalized states captured: yes in full-mode paths, null in compact minimal paths
- RNG seed or replay seed context: partial
  `state_raw.seed` exists, `state_raw.seedProvenance` exists in engine state, and `matchHistory[].roundSeed` exists in full state snapshots
- Enough replay context to force a candidate action and continue offline: partial
  It is available only when full pre-action `state_raw` and actor legal actions were stored
- Event index on decisions: not persisted today
- Active seat: indirectly available in `state_raw.activeSeat` or `state_norm.activeSeat`, not extracted into a decision column
- Explicit model metadata columns: not extracted; currently buried in `metadata`

Gaps:

- No extracted `event_index` on decisions
- No extracted latency column
- No extracted model-id/version/objective columns
- No explicit replay seed columns
- Full offline rollout is impossible from compact minimal decision telemetry

### Events

Current persisted event fields:

- `id`
- `match_id`
- `ts`
- `game_id`
- `hand_id`
- `phase`
- `event_type`
- `actor_seat`
- `event_index`
- `schema_version`
- `engine_version`
- `sim_version`
- `requested_provider`
- `provider_used`
- `worker_id`
- `fallback_used`
- `state_norm`
- `payload`
- `metadata`
- `state_hash`
- `event_hash`
- `created_at`

Audit answers:

- Events support outcome derivation: partially
- `round_scored`, `match_completed`, `hand_completed`, `game_completed`, and `phase_changed` exist in the engine/self-play path
- Full outcome detail is not extracted into scalar columns
- `state_norm.roundSummary` can carry:
  finish order, team scores, double victory, and Tichu or Grand Tichu bonuses
- `state_norm.matchScore`, `state_norm.matchComplete`, and `state_norm.matchWinner` can carry match outcome state
- Synthetic `hand_completed` and `game_completed` events currently use sparse payloads; they rely on `state_norm` for most outcome detail

Gaps:

- No extracted final team score columns
- No extracted winner columns
- No extracted finish-order columns
- No explicit hand score delta columns
- No match-complete or hand-complete columns on the event rows themselves

### Matches

Current persisted match fields:

- `id`
- `status`
- `created_at`
- `game_id`
- `last_hand_id`
- `provider`
- `requested_provider`
- `telemetry_mode`
- `strict_telemetry`
- `sim_version`
- `engine_version`
- `started_at`
- `completed_at`
- `updated_at`

Audit answers:

- Match lifecycle exists: yes
- Can each decision be joined to a match row: yes through `match_id` or `game_id`
- Final team scores stored in matches: no
- Winner team stored in matches: no
- Failure reason stored in matches: no
- Hands played stored in matches: no

Gaps:

- No final score columns
- No winner column
- No failure-reason column
- No hands-played column

### Provider Naming

Current repo behavior:

- Shared canonicalization exists in `packages/shared/src/backend.ts`
- Aliases normalize into:
  `local_heuristic`, `server_heuristic`, `lightgbm_model`, `human_ui`, `system_local`, `unknown`
- Decisions and events store raw requested and used provider strings plus canonicalized copies in metadata
- Matches store raw provider strings only

Verdict:

- Provider naming consistency: partial
- Canonical rules exist, but storage and reporting are not yet uniformly canonical at the table level

### Join and Replay Readiness

- Can each decision join to hand outcome: yes, by `game_id` plus `hand_id`, but outcome fields are not materialized
- Can each decision join to match outcome: yes, by `game_id` and `match_id`, but final score and winner are not materialized in `matches`
- Can each decision state be reconstructed for offline rollout: only for full-state captured decisions

## ML Export Audit

Current file: `ml/export_training_rows.py`

Observed behavior:

- Reads decisions with `cursor.fetchall()` and returns `list[dict]`
- Loads all queried decisions into memory before row building
- Expands one row per legal candidate action
- Preserves imitation target as:
  `label = 1 if candidate action equals chosen_action else 0`
- Writes one parquet file
- Writes only `ml/feature_schema.json` from code path

Audit answers:

- Streams or chunks: no
- Candidate-action rows: yes
- Includes all legal actions: yes, actor-scoped legal actions only
- Preserves candidate-was-chosen: partially
  only as binary `label`, not as a separate boolean column
- Actor-relative features: partial yes
- Absolute seat leakage: yes
  raw `actor_seat` is present and `actor_is_seat-*` one-hot features are included
- Heuristic score leakage: partial risk
  no explicit heuristic score column is exported, but candidate and state features come from the heuristic feature analyzer and there is no manifest separating runtime-safe features from heuristic-derived diagnostics
- Outcome labels: no
- Rollout labels: no
- Schema or manifest: no dataset schema or manifest
- Quality report: no
- Leakage exclusions documented: no

Current checked-in dataset snapshot:

- `ml/data/action_rows.parquet` exists
- Row count: `2`
- Phase values present: `trick_play`
- `label` unique values: `[0, 1]`
- No observed outcome columns
- No rollout columns

## Training Audit

Current file: `ml/train_lightgbm.py`

Observed behavior:

- Objective type: imitation binary classifier only
- Library surface: `lightgbm.LGBMClassifier`
- Target column: `label`
- Feature set: `FEATURE_ORDER` intersection with frame columns
- Validation split: split unique `decision_id` values, then fan rows by decision
- Metrics: optional validation AUC only
- Output files:
  `ml/model_registry/lightgbm_action_model.txt`
  `ml/model_registry/lightgbm_action_model.meta.json`

Audit answers:

- Training type: imitation
- Regression available: no
- Ranking available: no
- Mixed objectives: no
- Outcome columns accidentally included as runtime features: not currently, because outcome columns do not exist
- Train or validation grouped by decision: yes
- Train or validation grouped by game: no
- Manifest-driven feature selection: no

Current checked-in model metadata snapshot:

- Created at: `2026-04-20T04:00:59.835356+00:00`
- Feature count: `41`
- Phase: `trick_play`
- Row count: `2`
- Validation AUC: `null`

## Runtime Provider Audit

Current file: `apps/server/src/providers/lightgbm-provider.ts`

Observed behavior:

- Scores every actor legal action: yes
- Uses shared heuristic analyzer to build `stateFeatures` and per-candidate features
- Requires score count to match legal action count
- Sorts scored legal actions and picks highest score
- Falls back to `routeHeuristicDecision` on error
- Returns only a legal action from the original legal set

Audit answers:

- Does `lightgbm_model` score every legal action: yes
- Does it fallback safely: mostly yes
- Does telemetry record model metadata: yes, inside metadata and response metadata
- Does it record candidate score distribution: only raw score list, not summarized distribution stats
- Does it never return illegal actions: yes in nominal flow because selection comes from actor legal actions

Gaps:

- No explicit NaN or infinity guard before ranking
- No explicit fallback on invalid numeric scores
- No explicit `selected_candidate_score`, `top_k_candidate_scores`, `candidate_score_distribution`, `objective`, `label_mode`, or `feature_schema_version` extraction

## Evaluation Audit

Current file: `apps/sim-runner/src/evaluate.ts`

Observed behavior:

- Supports `local`, `server_heuristic`, and `lightgbm_model`
- Supports `--ns-provider`, `--ew-provider`, and per-seat overrides
- Writes machine-readable summary JSON plus `eval/results/latest_summary.json`
- Reports:
  win counts, win rates, score margin, total score, pass rate, bomb usage, wish satisfaction, fallback count, invalid decision count, provider usage, phase counts, and average latency by provider

Gaps:

- No mirrored seating option
- No explicit illegal-action gate beyond summary counts
- No fallback increase gate
- No configurable improvement gate
- No confidence interval or bootstrap summary
- No Tichu or Grand Tichu outcome metrics
- No double-victory metric
- No model-vs-heuristic pass or fail decision

## Evidence Paths

- `infra/db/migrations/0001_foundation.sql`
- `infra/db/migrations/0002_backend_foundation.sql`
- `infra/db/migrations/0003_telemetry_alignment.sql`
- `infra/db/migrations/0005_match_lifecycle.sql`
- `apps/server/src/services/telemetry-repository.ts`
- `packages/shared/src/backend.ts`
- `packages/telemetry/src/builders.ts`
- `packages/telemetry/src/source-adapters.ts`
- `apps/server/src/providers/lightgbm-provider.ts`
- `apps/server/src/ml/lightgbm-scorer.ts`
- `apps/sim-runner/src/self-play-batch.ts`
- `apps/sim-runner/src/evaluate.ts`
- `ml/export_training_rows.py`
- `ml/train_lightgbm.py`
- `ml/infer.py`
- `ml/data/action_rows.parquet`
- `ml/model_registry/lightgbm_action_model.meta.json`

## Audit Verdict

Before this change set, the repo is:

- not imitation-free
- observed-outcome unenriched by default
- not rollout or counterfactual strategy-ready
- not fully strategy-improvement ready

The strongest truthful label for the current repo state is:

- imitation-only, with telemetry foundations that can be extended toward observed-outcome enrichment and rollout-based strategy improvement
