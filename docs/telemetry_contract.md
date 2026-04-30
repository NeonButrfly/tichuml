# Canonical Telemetry Contract

Tracking issue: [#35](https://github.com/NeonButrfly/tichuml/issues/35)

## Authoritative Producer Subsystem

Producer-side telemetry is centralized in `packages/telemetry`. The package owns payload builders, source adapters, minimal/full/adaptive richness policy, byte-limit downgrade/skip policy, shared POST behavior, failure classification, strict-mode behavior, and structured diagnostics. Application code should only map local context into these shared builders.

Current source tags:

- `gameplay` for normal web gameplay
- `selfplay` for simulator/selfplay games
- `controller` for long-running controller worker telemetry
- `eval` for evaluation producers when used

The tag is stored in payload `metadata.source` and `metadata.telemetry_source` so existing backend validation and storage remain compatible while ML/export consumers can split rows by producer.

## Ingestion

Decision telemetry is ingested at `POST /api/telemetry/decision`. Event telemetry is ingested at `POST /api/telemetry/event`. Both routes validate payload shape synchronously and reject malformed payloads with `accepted: false` plus `validation_errors`. Valid telemetry returns after enqueue with `accepted: true`, `queued`, `dropped`, and `queue_depth`; Postgres persistence runs behind a bounded queue with batching and concurrency limits so ingest latency does not block gameplay or simulator progress.

## Decision Payload

Required canonical decision fields:

- `game_id`, `hand_id`, `ts`
- `phase`, `actor_seat`, `decision_index`
- `schema_version`, `engine_version`, `sim_version`
- `requested_provider`, `provider_used`, `fallback_used`
- `policy_name`, `policy_source`
- `state_raw`, `state_norm`
- actor-scoped `legal_actions`
- `chosen_action`
- `metadata`

Provider fields preserve the requested/used display names for compatibility,
but fallback detection uses the shared canonical provider normalizer.
`local`, UI local heuristic labels, and `local_heuristic` normalize to the same
provider, so that alias pair is not fallback. `fallback_used=true` means an
actual provider failure or unavailable requested provider caused another
provider to handle the decision.

Rich optional fields are preserved when available:

- `explanation`
- `candidateScores`
- `stateFeatures`
- `antipattern_tags`

Wish fields are explicit in decision metadata and normalized state features:
`current_wish` / `wish_rank`, `wish_owner` / `wish_source` when inferable,
`actor_holds_fulfilling_wish_card`, `legal_fulfilling_wish_move_count`,
`legal_fulfilling_wish_moves_exist`, `wish_fulfillment_required`,
`chosen_action_fulfilled_wish`, and
`chosen_action_failed_required_wish`. No active wish is represented as null
rank/source fields plus false booleans.

Candidate-score arrays use `expanded_candidate_actions` semantics. They may not
have the same count as compact legal actions because template actions can be
expanded and candidates can be filtered. Producers record compact legal-action
count, scored candidate count, chosen-action scored coverage, and an explicit
unscored reason when the chosen action is not directly represented.

Minimal mode keeps the validator-compatible core compact by using `state_raw: {}`, `state_norm: null`, actor-scoped legal actions, the selected action, provider context, source metadata, and compact state features. Full mode keeps raw state, normalized state, richer legal-action context, explanations, candidate scores, and state features for training and debugging. Adaptive currently follows the same central size policy and is reserved for future expansion.

Consistency checks:

- `chosen_action` must match one of `actor_seat`'s legal actions.
- `phase` must match `state_raw.phase` when present.
- `actor_seat` must match `state_raw.activeSeat` when a seat actor is active.
- `legal_actions` must be an actor-scoped array or a map containing `actor_seat`.

## Event Payload

Required canonical event fields:

- `game_id`, `hand_id`, `ts`
- `phase`, `event_type`, `event_index`
- `actor_seat` when derivable, otherwise `null`
- `schema_version`, `engine_version`, `sim_version`
- provider context when meaningful: `requested_provider`, `provider_used`, `fallback_used`
- `state_norm` snapshot when available
- raw `payload`
- `metadata`

Event metadata carries provider canonicalization fields and active wish rank
when `state_norm` exposes one. Event fallback flags follow the same canonical
provider rule as decisions.

## Stored Fields

The database keeps raw JSONB for:

- `state_raw`
- `state_norm`
- `legal_actions`
- `chosen_action`
- `metadata`
- event `payload`
- rich decision `explanation`, `candidate_scores`, `state_features`

It also stores query-friendly scalar fields:

- provider context
- `worker_id` when emitted by simulator controller workers
- decision/event indexes
- `chosen_action_type`
- `legal_action_count`
- `chosen_action_is_legal`
- explanation/candidate/state feature flags
- `explanation_quality_level` (`none`, `basic`, `scored`, `featured`)
- wish/pass helpers
- `state_hash`, `legal_actions_hash`, `chosen_action_hash`, `event_hash`

Views:

- `telemetry_decision_counts_by_phase_provider`
- `telemetry_event_counts_by_type_phase`
- `telemetry_training_readiness_stats`
- `telemetry_duplicate_state_counts`
- `telemetry_duplicate_legal_action_counts`

Hashes are computed from canonical JSON with object keys sorted before hashing.
Use `stableTelemetryHash` from `@tichuml/shared` whenever another layer needs to
produce comparable hashes.

## Health / ML Usefulness

`GET /api/telemetry/health` returns decision/event totals, unique and duplicate
state/action-set hash counts, provider/phase/seat/type aggregates, rich-metadata
coverage, legal chosen-action coverage, wish/pass counts, and latest telemetry
timestamps plus backend queue stats. This endpoint is intended for operator
checks and training-readiness diagnostics, not as a UI contract.

## ML Export

`ml/export_training_rows.py` reads decisions as the canonical ML source. It
orders rows by `game_id`, `hand_id`, `decision_index`, `ts`, then `id`, prefers
canonical rich columns, and falls back to legacy metadata paths for explanation,
`candidateScores`, and `stateFeatures`.
Rows from malformed legacy decisions are filtered when `chosen_action_is_legal`
is explicitly false or actor-scoped legal actions are missing, and diagnostics
report the filtered count.

Normal gameplay and selfplay now feed the same backend decision/event tables through `@tichuml/telemetry`, so training exports can use one dataset path while retaining producer/source metadata.

Use `npm run telemetry:sanity -- --backend-url http://127.0.0.1:4310` before
training to verify provider fallback truth, wish coverage, legal chosen actions,
`select_pass` semantic validity, candidate-score coverage, deterministic event
ordering, and JSON health. The sanity summary also reports Mahjong wish quality:
`mahjong_played_count`, `mahjong_with_wish_rank_count`,
`mahjong_without_wish_rank_count`,
`mahjong_wish_available_but_skipped_count`,
`mahjong_wish_skipped_reasons`, `wish_reason_counts`,
`required_wish_fulfilled_count`, `required_wish_violation_count`,
`wish_considered_tichu_pressure_count`, and
`wish_considered_grand_tichu_pressure_count`.
